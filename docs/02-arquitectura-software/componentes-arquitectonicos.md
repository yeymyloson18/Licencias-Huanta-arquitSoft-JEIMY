# Componentes arquitectónicos – API de Licencias de Funcionamiento

**Modelo C4 – Nivel 3 (componentes)** del contenedor *Backend API*.
Estilo: monolito modular en capas, con Clean Architecture dentro de cada módulo.

## Diagrama de componentes

```mermaid
flowchart TB
    Adm(["Administrado<br/>[Persona]"])
    Per(["Personal municipal<br/>[Persona]<br/>mesa de partes, evaluador, inspector, caja, jefatura"])
    AdmS(["Administrador del sistema<br/>[Persona]<br/>usuarios, catálogo y feriados"])

    Front["Portal Web responsive<br/>[Contenedor: SPA React]"]

    subgraph API["Backend API - Contenedor: Node.js + NestJS - monolito modular"]
        Rest["API REST<br/>[Componente: rutas + middlewares]<br/>autenticación JWT + OTP, roles, validación,<br/>límite de intentos"]

        subgraph MOD["Módulos de negocio"]
            Seg["Seguridad y Usuarios<br/>[Componente]<br/>cuentas, roles, OTP del personal<br/>y del administrado"]
            Cat["Catálogo y Asistente de ruta<br/>[Componente]<br/>9 recetas"]
            Tra["Trámites<br/>[Componente]<br/>expediente, documentos, estados"]
            Pag["Pagos en caja<br/>[Componente]<br/>esquela y registro del pago"]
            Ins["Inspecciones<br/>[Componente]<br/>agenda y resultado ITSE"]
            Lic["Licencias<br/>[Componente]<br/>emisión, QR, vigencias, aviso ITSE"]
            Pla["Reloj de plazos<br/>[Componente]<br/>tarea diaria en días hábiles"]
            Not["Notificaciones<br/>[Componente]<br/>arma y encola avisos"]
            Rep["Reportes<br/>[Componente]<br/>tablero de jefatura"]
        end
    end

    Redis[("Caché<br/>[Contenedor: Redis]")]
    Cola["Cola y workers<br/>[Contenedor]<br/>PDF, QR, correos, SMS<br/>y eventos pendientes"]
    BD[("Base de datos<br/>[Contenedor: PostgreSQL]")]
    Obj[("Almacén de documentos y fotos<br/>[Contenedor]")]

    Ident["Validación DNI / RUC<br/>[Sistema externo]"]
    Msg["Correo y SMS<br/>[Sistema externo]"]

    Adm --> Front
    Per --> Front
    AdmS --> Front
    Front -->|"llama a la API - HTTPS/JSON"| Rest
    Rest -->|"valida sesión, OTP y rol"| Seg
    Rest -->|"invoca casos de uso"| MOD

    Tra -->|"lee receta"| Cat
    Pag -->|"lee la tasa - ConsultaTasa"| Cat
    Ins -->|"lee la ruta A, B o C"| Cat
    Lic -->|"lee vigencias"| Cat
    Pla -->|"lee plazos"| Cat

    Tra -->|"solicita esquela - rutas A y B"| Pag
    Pag -.->|"publica: PagoRegistrado - vía outbox"| Tra
    Tra -->|"agenda ITSE"| Ins
    Ins -.->|"publica: ResultadoITSERegistrado"| Tra
    Tra -->|"solicita emisión"| Lic
    Pla -->|"lee expedientes abiertos - ConsultaExpedientes"| Tra
    Pla -->|"alerta vencimientos"| Not
    Lic -->|"aviso de vencimiento ITSE"| Not
    Tra -.->|"publica: EstadoExpedienteCambiado"| Not
    Rep -->|"solo lectura: expedientes y tiempos"| Tra
    Rep -->|"solo lectura: ingresos de caja"| Pag
    Rep -->|"solo lectura: licencias e ITSE por vencer"| Lic

    Rest -->|"contadores de intentos"| Redis
    Cat -->|"cachea recetas; borra la clave al actualizar"| Redis
    Tra -->|"cachea el estado; borra la clave al cambiar"| Redis
    Not -->|"encola mensajes"| Cola
    Pag -->|"encola PDF de esquela"| Cola
    Lic -->|"encola PDF y QR"| Cola
    Tra -->|"guarda documentos"| Obj
    Ins -->|"guarda fotos"| Obj
    MOD -->|"cada módulo lee y escribe solo sus tablas - SQL"| BD

    Tra -->|"valida identidad - HTTPS/REST"| Ident
    Cola -->|"los workers leen eventos_pendientes - SQL"| BD
    Cola -->|"los workers envían - HTTPS/REST"| Msg
    Seg -->|"OTP directo - HTTPS/REST"| Msg
```

**Leyenda:** flecha continua = llamada directa (entre módulos, siempre a la fachada pública del otro módulo; también hacia contenedores y sistemas externos); flecha punteada = evento publicado.

**Notas:**
1. Cada componente es un módulo del monolito: todos se despliegan juntos.
2. Un módulo usa a otro **solo a través de su fachada pública** o de eventos; **nunca accede a sus tablas ni a sus repositorios**.
3. Los módulos consultan el **Catálogo** para conocer las reglas del TUPA; la tasa existe **solo** en el catálogo.
4. No hay pagos digitales: **Pagos en caja** genera una sola esquela por expediente (rutas A y B) y registra el pago que hace el personal de caja. La ruta C es gratuita y no genera esquela.
5. **Notificaciones** no envía directamente: arma el mensaje y lo deja en la cola; los **workers** lo envían. **Excepción:** el código OTP lo envía Seguridad directamente, porque la persona lo espera en ese momento (inicio de sesión del personal o confirmación de identidad del administrado).
6. Las tareas diarias (Reloj de plazos y aviso ITSE) corren **una sola vez al día** aunque haya varias instancias, gracias a un bloqueo en PostgreSQL (ADR-006).
7. **Outbox:** Pagos guarda el pago y el evento `PagoRegistrado` en la misma operación (tabla `eventos_pendientes`). Los workers se ejecutan con el **mismo código del backend**, leen esa tabla y ejecutan el caso de uso de Trámites que avanza el expediente; si falla, lo reintentan.
8. **Auditoría:** cada módulo guarda en su propia tabla quién hizo cada operación importante y cuándo (RF25), en la misma transacción que la operación.

## Responsabilidades y trazabilidad de cada componente

| Componente | Responsabilidad | Historias / requisitos | Driver / ADR | Escenario |
|---|---|---|---|---|
| **API REST** | Única puerta de entrada; autentica, autoriza, valida solicitudes y limita los intentos fallidos (contadores en Redis). | Todas las HU · RF03, RF16, RF17 | DA03 · ADR-007 | EQ-04 |
| **Seguridad y Usuarios** | Cuentas, roles y segundo factor (OTP) del personal; código OTP para que el administrado confirme su celular antes de presentar; envía el OTP directamente. | HU02, HU15 · RF06, RF16, RF17, RF22 | DA03 · ADR-007 | EQ-04 |
| **Catálogo y Asistente de ruta** | Guarda las 9 recetas, propone la licencia con tres preguntas y permite al administrador actualizar las recetas. | HU01, HU03, HU14 · RF01, RF02, RF05, RF21 | DA01 · ADR-002 | EQ-05, EQ-06 |
| **Trámites** | Registra la solicitud (con la identidad validada), valida documentos, asigna la ruta, controla el estado del expediente (cacheado en Redis), atiende trámites conectados y guarda la auditoría de las decisiones del evaluador. | HU02, HU05, HU07, HU12 · RF03, RF04, RF06, RF07, RF09, RF15, RF25 | DA01, DA08 · ADR-002, ADR-003 | EQ-01, EQ-04 |
| **Pagos en caja** | Genera una sola esquela por expediente con código único, registra el pago hecho en caja, permite a la jefatura corregir un número de recibo y guarda la auditoría de los pagos. | HU04, HU13, HU17 · RF11, RF12, RF24, RF25 | DA04 · ADR-004 | EQ-04 |
| **Inspecciones** | Agenda la ITSE, asigna el inspector, guarda el resultado con fotos desde el celular y su auditoría. | HU08 · RF10, RF25 | DA01 · ADR-002 | EQ-04 |
| **Licencias** | Emite la licencia con QR (con auditoría), controla vigencias y, con una tarea diaria, avisa la renovación del ITSE. | HU06, HU11 · RF13, RF14, RF25 | DA01 · ADR-002 | EQ-04 |
| **Reloj de plazos** | Cuenta días hábiles con el calendario de feriados y alerta antes de cada vencimiento. | HU09, HU16 · RF08, RF23 | DA05 · ADR-006 | EQ-07 |
| **Notificaciones** | Arma los avisos y los encola; los workers envían correos y SMS. | HU05, HU09, HU11 · RF20 | DA02 · ADR-005 | EQ-02 |
| **Reportes** | Tablero de jefatura: lee, sin modificar, expedientes (Trámites), ingresos (Pagos en caja) y licencias e ITSE por vencer (Licencias). | HU10 · RF18, RF19 | DA02 · ADR-005 | EQ-01 |

## Ejemplo de trazabilidad completa: componente Pagos en caja

> El componente **Pagos en caja** sale de las historias **HU04** (obtener la esquela), **HU13** (registrar el pago en caja) y
> **HU17** (corregir un recibo y ver la auditoría), de los requisitos **RF11, RF12, RF24 y RF25** y de la restricción **RC11** (el TUPA indica el pago en caja).
> Eso genera el driver **DA04**, resuelto con el **ADR-004** (pago presencial con esquela).
> En el diseño se aplican el patrón **Repository** y el principio **DIP**, y su seguridad se comprueba con el escenario **EQ-04** (solo el rol de caja puede registrar pagos).