# Estilo arquitectónico

## Estilo seleccionado
**Monolito modular organizado en capas** (ADR-001).

- **Monolito:** el backend es una sola aplicación API REST con un solo despliegue, que se replica horizontalmente en los picos.
- **Modular:** se divide en módulos con límites claros: Catálogo, Trámites, Pagos, Inspecciones, Licencias, Notificaciones, Reloj de plazos, Reportes y Seguridad.
- **En capas:** cada módulo tiene Presentación (controladores), Lógica de negocio (servicios o casos de uso) y Datos (repositorios).
- **Centrado en el catálogo:** todos los módulos consultan el Catálogo antes de actuar (ADR-002).

El monolito es la **unidad de despliegue**; las capas son la **organización lógica**. Ambos coexisten.

## Justificación

| Driver | Cómo lo responde el estilo |
|---|---|
| DA09 - Simplicidad | Una sola aplicación y una sola base de datos, fácil de mantener para un equipo pequeño. |
| DA02 - Escalabilidad | El backend no guarda estado y se replica detrás de un balanceador. |
| DA01 - Modificabilidad | El catálogo concentra las reglas que cambian con el TUPA. |
| DA08 - Fase 2 | El chatbot entra como un canal más de la misma API. |

**Alternativa descartada:** microservicios. Exigen varias bases de datos, consistencia eventual, orquestación y más personal de TI, sin resolver el cuello de botella real, que es la base de datos.

## Diagrama del estilo arquitectónico

```mermaid
flowchart TD
    subgraph USUARIOS["USUARIOS"]
        Adm["Administrado"]
        Func["Mesa de partes y Evaluador"]
        Insp["Inspector ITSE"]
        Jef["Jefatura"]
        AdmF["Administrador funcional"]
    end

    Portal["Portal Web responsive<br/>+ PWA de inspectores sin conexión"]
    Chat["Chatbot web y WhatsApp<br/>Fase 2"]
    LB["Balanceador de carga"]

    subgraph MONOLITO["MONOLITO MODULAR - Backend API REST - un solo despliegue, N réplicas"]
        MW["Middlewares transversales<br/>autenticación JWT + OTP - roles - validación - límite de solicitudes - bitácora"]

        subgraph PRES["1. PRESENTACIÓN - controladores REST"]
            C1["catalogo.controller"]
            C2["tramites.controller"]
            C3["pagos.controller"]
            C4["inspecciones.controller"]
            C5["licencias.controller"]
            C6["reportes.controller"]
        end

        subgraph NEG["2. LÓGICA DE NEGOCIO - servicios"]
            Cat["CATÁLOGO<br/>9 recetas versionadas"]
            S2["Trámites<br/>expediente y estados"]
            S3["Pagos<br/>tasa e idempotencia"]
            S4["Inspecciones<br/>ITSE y resultado"]
            S5["Licencias<br/>emisión y QR"]
            S6["Reportes"]
            S7["Notificaciones"]
            S8["Reloj de plazos<br/>tarea diaria"]
        end

        subgraph DAT["3. DATOS - repositorios"]
            R["Repositorios por módulo<br/>+ ORM y pool de conexiones"]
        end
    end

    BD[("PostgreSQL<br/>primaria + réplicas")]
    Cache[("Redis")]
    Obj[("Almacén de documentos y fotos")]
    Cola["Cola de tareas + workers<br/>PDF, QR, correos"]

    Pasarela["Pasarela de pago"]
    Ident["Validación DNI / RUC"]
    Msg["Correo y SMS"]
    SIAF["SIAF-SP / Trámite documentario"]

    Adm --> Portal
    Func --> Portal
    Insp --> Portal
    Jef --> Portal
    AdmF --> Portal
    Adm -.-> Chat

    Portal -->|"HTTPS - JSON"| LB
    Chat -.->|"HTTPS - JSON"| LB
    LB --> MW
    MW --> PRES

    C1 --> Cat
    C2 --> S2
    C3 --> S3
    C4 --> S4
    C5 --> S5
    C6 --> S6

    S2 -.->|"consulta reglas"| Cat
    S3 -.->|"consulta tasa"| Cat
    S4 -.->|"consulta ruta"| Cat
    S5 -.->|"consulta vigencia"| Cat
    S8 -.->|"consulta plazos"| Cat

    NEG --> R
    R --> BD
    NEG --> Cache
    NEG --> Obj
    NEG --> Cola

    S3 -->|"HTTPS / REST"| Pasarela
    S2 -->|"HTTPS / REST"| Ident
    S7 -->|"HTTPS / REST"| Msg
    S3 -->|"API"| SIAF
```

## Reglas de la arquitectura

1. Cada capa solo invoca a la capa inmediatamente inferior.
2. Un módulo no accede a las tablas de otro módulo; lo hace a través de su servicio.
3. Todos los módulos consultan el **Catálogo** para conocer las reglas del TUPA (no las repiten).
4. Las tareas lentas (PDF, QR, correos) van a la cola, no bloquean al usuario.
5. Todo corre como una sola aplicación, replicable, con una única base de datos principal.