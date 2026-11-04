# Arquitectura inicial del sistema

## Estilo arquitectónico
**Monolito modular en tres capas, dirigido por un catálogo de licencias.**
Una sola aplicación organizada en módulos que comparten una base de datos PostgreSQL.
Todos los módulos consultan el **Catálogo de licencias** antes de actuar, por lo que las
reglas del TUPA viven en un solo lugar.

| Capa | Pregunta que responde | Componentes |
|---|---|---|
| Presentación | ¿Cómo interactúa el usuario? | Portal Web responsive (computadora y celular), API REST, chatbot (Fase 2) |
| Lógica de negocio | ¿Qué hace el sistema? | Catálogo, asistente de ruta, trámites, pagos en caja, inspecciones, licencias, notificaciones, reloj de plazos, seguridad y reportes |
| Datos | ¿Dónde se almacena la información? | PostgreSQL, almacén de documentos y fotos, caché Redis |

## Diagrama de arquitectura

```mermaid
flowchart TD
    subgraph ACTORES["ACTORES"]
        Adm["Administrado"]
        Func["Mesa de partes y Evaluador"]
        Insp["Inspector ITSE"]
        Caja["Personal de caja"]
        Jef["Jefatura"]
        AdmS["Administrador del sistema"]
    end

    subgraph PRESENTACION["PRESENTACIÓN"]
        Portal["Portal Web responsive<br/>computadora y celular"]
        Chat["Chatbot - Fase 2"]
        API["API REST"]
    end

    subgraph NEGOCIO["LÓGICA DE NEGOCIO - monolito modular"]
        Catalogo["CATÁLOGO DE LICENCIAS<br/>9 recetas"]
        Asistente["Asistente de ruta"]
        Tramites["Trámites"]
        Pagos["Pagos en caja<br/>esquelas"]
        Inspecciones["Inspecciones ITSE"]
        Licencias["Licencias y QR"]
        Notif["Notificaciones"]
        Reloj["Reloj de plazos"]
        Seguridad["Seguridad y usuarios"]
        Reportes["Reportes"]
    end

    subgraph DATOS["DATOS"]
        BD[("PostgreSQL")]
        Docs[("Almacén de documentos y fotos")]
        Cache[("Caché Redis")]
    end

    Workers["Cola y workers<br/>PDF, QR, correos y eventos pendientes"]

    subgraph EXTERNOS["SISTEMAS EXTERNOS"]
        Ident["Validación DNI / RUC"]
        Mensajeria["Correo y SMS"]
        WA["WhatsApp Business API - Fase 2"]
    end

    Adm --> Portal
    Func --> Portal
    Insp --> Portal
    Caja --> Portal
    Jef --> Portal
    AdmS --> Portal
    Portal --> API
    Chat -.->|"Fase 2"| API
    WA -.-> Chat

    API -->|"valida sesión y rol"| Seguridad
    API --> NEGOCIO

    Asistente --> Catalogo
    Tramites --> Catalogo
    Pagos --> Catalogo
    Inspecciones --> Catalogo
    Licencias --> Catalogo
    Reloj --> Catalogo
    Reloj -->|"consulta expedientes abiertos"| Tramites

    NEGOCIO --> DATOS

    Tramites -->|"valida identidad"| Ident
    Notif -->|"encola avisos"| Workers
    Workers -->|"envía"| Mensajeria
    Workers -->|"lee eventos pendientes"| BD
    Seguridad -->|"OTP directo"| Mensajeria
```

## Rutas del trámite

```mermaid
flowchart LR
    S["Solicitud con requisitos completos"] --> A0
    S --> B0
    S --> C1

    subgraph RA["Ruta A - ITSE después: tipos 1, 2 y 6"]
        A0["Verificación de requisitos<br/>y del nivel de riesgo"] --> A4["Esquela de pago"] --> A1["Pago en caja"] --> A2["Licencia emitida al registrar el pago<br/>dentro de los 2 días hábiles"] --> A3["ITSE posterior hasta 9 días hábiles"]
    end

    subgraph RB["Ruta B - ITSE antes: tipos 3, 4, 5, 7 y 8"]
        B0["Evaluación previa<br/>confirma el nivel de riesgo"] --> B4["Esquela de pago"] --> B1["Pago en caja"] --> B2["ITSE previa"] --> B3["Licencia"]
        B0 -->|"deniega"| BX["Denegada"]
        B2 -->|"desfavorable"| BX
    end

    subgraph RC["Ruta C - Bodega: tipo 9"]
        C1["Provisional gratis en 5 días hábiles<br/>sin esquela"] --> C2["ITSE dentro de 6 meses"] --> C3["Definitiva a los 12 meses"]
    end
```

## Catálogo de licencias (las nueve recetas)

| N.° | Licencia | ITSE | Tasa (S/) | Plazo | Calificación | Ruta |
|---|---|---|---|---|---|---|
| 1 | Riesgo bajo | Posterior | 159.50 | 2 días | Automática | A |
| 2 | Riesgo medio | Posterior | 177.10 | 2 días | Automática | A |
| 3 | Riesgo alto | Previa | 305.90 | 8 días | Evaluación previa | B |
| 4 | Riesgo muy alto | Previa | 538.90 | 8 días | Evaluación previa | B |
| 5 | Corporativa | Previa | 529.20 | 8 días | Evaluación previa | B |
| 6 | Cesionarios, riesgo medio | Posterior | 180.40 | 2 días | Automática | A |
| 7 | Cesionarios, riesgo alto | Previa | 309.20 | 8 días | Evaluación previa | B |
| 8 | Cesionarios, riesgo muy alto | Previa | 542.20 | 8 días | Evaluación previa | B |
| 9 | Provisional para bodegas | Posterior (6 meses) | Gratis | 5 días | Automática | C |

Fuente: TUPA 2024 de la Municipalidad Provincial de Huanta. Plazos en días hábiles.

**Trámites conectados (RF15):** la transferencia, el cambio de giro y el duplicado no son recetas nuevas. El catálogo guarda
además, con su propio código, la tasa y los requisitos que el TUPA fija para cada uno. Cada trámite conectado es un expediente
nuevo, con su propia esquela, y sigue un camino corto: verificación de requisitos, esquela, pago en caja y emisión, sin ITSE nueva. Si un cambio de giro cambia el nivel de riesgo,
se tramita como una licencia nueva.

**Regla para que la tasa siempre coincida:** la esquela se genera **después** de confirmar el nivel de riesgo
(en la verificación de requisitos de la ruta A o al terminar la evaluación previa de la ruta B). Si el evaluador
corrige el riesgo, el expediente toma la receta del nuevo nivel (tasa, plazo y ruta) **antes** de generar la esquela.

**Plazo de la ruta A:** los 2 días hábiles del TUPA cubren la verificación de requisitos y la emisión. El evaluador verifica los
requisitos y confirma el nivel de riesgo; después, la licencia la emite el sistema automáticamente (calificación automática) en cuanto
caja registra el pago, sin esperar otra decisión del evaluador.

**Plazo de la ruta B:** los 8 días hábiles del TUPA cubren la evaluación previa, la ITSE previa y la emisión. Cuántos días toca a cada etapa es un punto **por validar con la Municipalidad**.

**Espera del pago (rutas A y B):** los días que el expediente espera el pago en caja dependen del administrado; si se descuentan
o no del plazo es un punto **por validar con la Municipalidad**.

## Descripción

- **Presentación:** todos los usuarios entran por el Portal Web, desde computadora o celular con internet. El Portal se comunica con el backend mediante una API REST, que limita los intentos fallidos de consulta e inicio de sesión. Antes de presentar una solicitud en línea, el administrado confirma su identidad (DNI con fecha de emisión y código OTP en su celular). En la Fase 2 se suma un chatbot que usa la misma API.
- **Lógica de negocio:** una sola aplicación organizada en módulos. El **Catálogo de licencias** es el corazón: cada módulo lo consulta para saber qué requisitos pedir, qué tasa cobrar, qué ruta seguir y qué plazo controlar.
- **Pago:** en las rutas A y B el sistema genera **una sola esquela de pago por expediente** con la tasa del catálogo; la persona paga en la caja de la Municipalidad y el personal de caja, después de confirmar en pantalla el expediente, el titular y el monto, registra el pago. La ruta C (bodega) es gratuita y no genera esquela.
- **Notificaciones:** el módulo Notificaciones solo **encola** los avisos; los **workers** son los que envían los correos y SMS. La única excepción es el **código OTP**, que el módulo Seguridad envía directo porque la persona lo espera en ese momento (inicio de sesión del personal o confirmación de identidad del administrado).
- **Datos:** PostgreSQL guarda toda la información, incluido el registro de auditoría; los PDF, planos y fotos se guardan en un almacén aparte; Redis acelera el catálogo y el estado de los trámites y guarda los contadores de intentos. Cuando cambia una receta o el estado de un expediente, su clave se borra de Redis (ADR-005).

## Despliegue

| Componente | Descripción |
|---|---|
| Servidor de aplicación | Mínimo 2 instancias del backend; se agregan más en los picos (de 1,000 a 10,000 usuarios). |
| Balanceador de carga | Reparte las solicitudes entre las instancias. |
| Base de datos | PostgreSQL primaria con réplica en espera, conmutación automática y copias diarias. |
| Caché | Redis para el catálogo, el estado de los trámites y los contadores de intentos. |
| Cola y workers | Generan los PDF de esquelas y licencias, los QR, envían correos y SMS y entregan los eventos pendientes (outbox), en segundo plano. |
| Almacén de documentos | Guarda PDF, planos y fotos de inspección. |