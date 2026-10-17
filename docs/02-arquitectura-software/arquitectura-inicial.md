# Arquitectura inicial del sistema

## Estilo arquitectónico
**Monolito modular en tres capas, dirigido por un catálogo de licencias.**
Una sola aplicación organizada en módulos que comparten una base de datos PostgreSQL.
Todos los módulos consultan el **Catálogo de licencias** antes de actuar, por lo que las
reglas del TUPA viven en un solo lugar.

| Capa | Pregunta que responde | Componentes |
|---|---|---|
| Presentación | ¿Cómo interactúa el usuario? | Portal Web, app de inspectores sin conexión, API REST, chatbot (Fase 2) |
| Lógica de negocio | ¿Qué hace el sistema? | Catálogo, asistente de ruta, trámites, pagos, inspecciones, licencias, notificaciones, reloj de plazos, seguridad y reportes |
| Datos | ¿Dónde se almacena la información? | PostgreSQL, almacén de documentos y fotos, caché Redis |

## Diagrama de arquitectura

```mermaid
flowchart TD
    subgraph ACTORES["ACTORES"]
        Adm["Administrado"]
        Func["Mesa de partes y Evaluador"]
        Insp["Inspector ITSE"]
        Jef["Jefatura"]
        AdmF["Administrador funcional"]
    end

    subgraph PRESENTACION["PRESENTACIÓN"]
        Portal["Portal Web responsive"]
        PWA["App de inspectores sin conexión"]
        Chat["Chatbot - Fase 2"]
        API["API REST"]
    end

    subgraph NEGOCIO["LÓGICA DE NEGOCIO - monolito modular"]
        Catalogo["CATÁLOGO DE LICENCIAS<br/>9 recetas versionadas"]
        Asistente["Asistente de ruta"]
        Tramites["Trámites"]
        Pagos["Pagos"]
        Inspecciones["Inspecciones ITSE"]
        Licencias["Licencias y QR"]
        Notif["Notificaciones"]
        Reloj["Reloj de plazos"]
        Seguridad["Seguridad y bitácora"]
        Reportes["Reportes"]
    end

    subgraph DATOS["DATOS"]
        BD[("PostgreSQL")]
        Docs[("Almacén de documentos y fotos")]
        Cache[("Caché Redis")]
    end

    subgraph EXTERNOS["SISTEMAS EXTERNOS"]
        Pasarela["Pasarela de pago"]
        Ident["Validación DNI / RUC"]
        Mensajeria["Correo y SMS"]
        WA["WhatsApp Business API"]
        SIAF["SIAF-SP / Trámite documentario"]
    end

    Adm --> Portal
    Func --> Portal
    Jef --> Portal
    AdmF --> Portal
    Insp --> PWA
    Portal --> API
    PWA --> API
    Chat -.->|"Fase 2"| API
    WA -.-> Chat

    API --> NEGOCIO

    Asistente --> Catalogo
    Tramites --> Catalogo
    Pagos --> Catalogo
    Inspecciones --> Catalogo
    Licencias --> Catalogo

    NEGOCIO --> DATOS

    Pagos -->|"cobro con id único"| Pasarela
    Tramites -->|"valida identidad"| Ident
    Notif -->|"avisos"| Mensajeria
    Tramites -->|"API"| SIAF
```

## Rutas del trámite

```mermaid
flowchart LR
    S["Solicitud y pago de tasa"] --> A1
    S --> B1
    S --> C1

    subgraph RA["Ruta A - ITSE después: tipos 1, 2 y 6"]
        A1["Licencia en 2 días hábiles"] --> A2["ITSE hasta 9 días hábiles"] --> A3["Certificado ITSE, se renueva cada 2 años"]
    end

    subgraph RB["Ruta B - ITSE antes: tipos 3, 4, 5, 7 y 8"]
        B1["Revisión de documentos"] --> B2["ITSE previa hasta 7 días hábiles"] --> B3["Licencia en 1 día hábil"]
    end

    subgraph RC["Ruta C - Bodega: tipo 9"]
        C1["Provisional gratis en 5 días hábiles"] --> C2["ITSE dentro de 6 meses"] --> C3["Definitiva a los 12 meses"]
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

## Descripción

- **Presentación:** el administrado, el personal municipal y la jefatura entran por el Portal Web; los inspectores usan una app instalable que funciona sin conexión. Todos se comunican con el backend mediante una API REST. En la Fase 2 se suma un chatbot (web y WhatsApp) que usa la misma API.
- **Lógica de negocio:** una sola aplicación organizada en módulos. El **Catálogo de licencias** es el corazón: cada módulo lo consulta para saber qué requisitos pedir, qué tasa cobrar, qué ruta seguir y qué plazo controlar.
- **Datos:** PostgreSQL guarda toda la información con respaldo diario; los PDF, planos y fotos se guardan en un almacén aparte; Redis acelera el catálogo y el estado de los trámites.
- **Sistemas externos:** el módulo de Pagos se integra con la pasarela de pago; Trámites valida DNI/RUC; Notificaciones envía correos y SMS.

## Decisiones arquitectónicas

| Decisión | Alternativa descartada | Justificación | Driver |
|---|---|---|---|
| Catálogo versionado de recetas | Programar 9 procesos distintos | Un cambio del TUPA se carga como una versión nueva, sin tocar el código. | DA01 |
| Monolito modular | Microservicios | Más simple de construir, probar y mantener; permite separar módulos más adelante. | DA09 |
| Autoescalado, balanceador, Redis, réplicas de lectura y workers | Un solo servidor grande | Permite pasar de 1,000 a 10,000 usuarios agregando copias según la demanda y reducirlas cuando baja, pagando solo lo que se usa. | DA02 |
| Identificador único por pago | Confiar en la pasarela | Evita cobros dobles ante reintentos. | DA04 |
| PWA sin conexión para inspectores | App nativa | Una sola base de código y funciona sin señal. | DA07 |
| Chatbot que lee el catálogo | Chatbot con respuestas libres | Responde con datos oficiales y no inventa requisitos ni costos. | DA08 |

## Arquitectura de despliegue (1,000 a 10,000 usuarios simultáneos)

La vista lógica no cambia: sigue siendo un monolito modular en tres capas.
La escalabilidad se resuelve en el despliegue, porque el backend no guarda estado
y puede replicarse.

```mermaid
flowchart TD
    Usuarios["Usuarios: web, celular e inspectores"]

    subgraph BORDE["BORDE"]
        CDN["CDN - portal y archivos estáticos"]
        WAF["Firewall web y límite de solicitudes"]
        Espera["Sala de espera virtual - solo picos"]
        LB["Balanceador de carga"]
    end

    subgraph APP["BACKEND - autoescalado de 2 a N instancias"]
        I1["Instancia 1 - monolito modular"]
        I2["Instancia 2 - monolito modular"]
        IN["Instancia N - se crea según la carga"]
    end

    subgraph ASYNC["PROCESAMIENTO ASÍNCRONO"]
        Cola["Cola de mensajes"]
        Workers["Workers: PDF, QR, correos y SMS"]
    end

    subgraph DATOS["DATOS"]
        Redis[("Redis - caché, sesiones y límites")]
        Pool["Pool de conexiones - PgBouncer"]
        Primaria[("PostgreSQL primaria - escrituras")]
        Replicas[("Réplicas de lectura - consultas y reportes")]
        Objetos[("Almacén de documentos y fotos")]
    end

    subgraph OBS["OBSERVABILIDAD"]
        Monitoreo["Métricas, logs y alertas"]
    end

    Usuarios --> CDN
    Usuarios --> WAF
    WAF --> Espera
    Espera --> LB
    LB --> I1
    LB --> I2
    LB --> IN

    APP --> Redis
    APP --> Pool
    Pool --> Primaria
    Pool --> Replicas
    Primaria -->|"replicación"| Replicas
    APP -->|"tareas lentas"| Cola
    Cola --> Workers
    Usuarios -->|"carga directa con URL firmada"| Objetos

    APP -.-> Monitoreo
    Workers -.-> Monitoreo
```

### Escalamiento por etapas

| Etapa | Usuarios simultáneos | Configuración |
|---|---|---|
| Normal | Hasta 1,000 | 2 instancias, Redis, PostgreSQL primaria con 1 réplica |
| Campaña | 1,000 a 5,000 | El autoescalado agrega instancias; las consultas y reportes van a las réplicas de lectura |
| Pico máximo | 5,000 a 10,000 | Más instancias y workers, más réplicas de lectura; si se supera la capacidad, se activa la sala de espera virtual |
| Después del pico | Baja la demanda | El autoescalado vuelve a 2 instancias para reducir costos |

Las cifras de cada etapa son referenciales y se confirman con pruebas de carga.

### Infraestructura sugerida

| Componente | Dimensionamiento sugerido (referencial) |
|---|---|
| Servidor de aplicación | 2 vCPU / 4 GB por instancia; mínimo 2, máximo definido por pruebas de carga |
| Balanceador de carga | Servicio administrado del proveedor cloud |
| PostgreSQL primaria | 4 a 8 vCPU / 16 a 32 GB, disco SSD |
| Réplicas de lectura | 1 en operación normal y 2 o más en picos |
| Pool de conexiones | PgBouncer |
| Redis | Obligatorio, con réplica |
| Cola y workers | Cola de mensajes y workers con autoescalado propio |
| Almacén de documentos | Almacenamiento de objetos con URL firmadas |
| CDN y firewall web | Servicio del proveedor cloud |
| Observabilidad | Métricas, logs centralizados y alertas |

### Validación con pruebas de carga

| Escenario | Usuarios simultáneos | Qué se mide |
|---|---|---|
| Operación normal | 1,000 | Tiempos de respuesta y uso de CPU y memoria |
| Campaña | 5,000 | Que el autoescalado cree instancias a tiempo |
| Pico máximo | 10,000 | Que se cumplan AC02 y AC04 y que la tasa de errores sea menor al 1 % |
| Reintento de pagos | Variable | Que no haya cobros dobles bajo carga |