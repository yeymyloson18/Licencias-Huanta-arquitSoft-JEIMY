# Estilo arquitectónico

## Estilo seleccionado
**Monolito modular organizado en capas** (ADR-001).

- **Monolito:** el backend es una sola aplicación API REST con un solo despliegue, que se replica en los picos.
- **Modular:** se divide en módulos con límites claros: Catálogo, Trámites, Pagos en caja, Inspecciones, Licencias, Notificaciones, Reloj de plazos, Reportes y Seguridad.
- **En capas:** cada módulo tiene Presentación (controladores), Lógica de negocio (servicios o casos de uso) y Datos (repositorios).
- **Centrado en el catálogo:** todos los módulos consultan el Catálogo antes de actuar (ADR-002).

El monolito es la **unidad de despliegue**; las capas son la **organización lógica**. Ambos coexisten.

## Justificación

| Driver | Cómo lo responde el estilo |
|---|---|
| DA07 - Simplicidad | Una sola aplicación y una sola base de datos, fácil de mantener para un equipo pequeño. |
| DA02 - Escalabilidad | El backend no guarda estado y se replica detrás de un balanceador. |
| DA01 - Catálogo | El catálogo concentra las reglas que cambian con el TUPA. |
| DA08 - Fase 2 | El chatbot entra como un canal más de la misma API. |

**Alternativa descartada:** microservicios. Exigen varias bases de datos, orquestación y más personal de TI, sin un beneficio claro para el tamaño de una municipalidad provincial.

## Diagrama del estilo arquitectónico

```mermaid
flowchart TD
    subgraph USUARIOS["USUARIOS"]
        Adm["Administrado"]
        Func["Mesa de partes y Evaluador"]
        Insp["Inspector ITSE"]
        Caja["Personal de caja"]
        Jef["Jefatura"]
    end

    Portal["Portal Web responsive<br/>computadora y celular"]
    LB["Balanceador de carga"]

    subgraph MONOLITO["MONOLITO MODULAR - Backend API REST - un solo despliegue, N instancias"]
        MW["Middlewares transversales<br/>autenticación JWT + OTP - roles - validación"]

        subgraph PRES["1. PRESENTACIÓN - controladores REST"]
            C1["catalogo.controller"]
            C2["tramites.controller"]
            C3["pagos.controller"]
            C4["inspecciones.controller"]
            C5["licencias.controller"]
            C6["reportes.controller"]
        end

        subgraph NEG["2. LÓGICA DE NEGOCIO - servicios"]
            Cat["CATÁLOGO<br/>9 recetas"]
            S2["Trámites<br/>expediente y estados"]
            S3["Pagos en caja<br/>esquela y registro"]
            S4["Inspecciones<br/>ITSE y resultado"]
            S5["Licencias<br/>emisión y QR"]
            S6["Reportes"]
            S7["Notificaciones"]
            S8["Reloj de plazos<br/>tarea diaria"]
        end

        subgraph DAT["3. DATOS - repositorios"]
            R["Repositorios por módulo<br/>+ ORM"]
        end
    end

    BD[("PostgreSQL<br/>primaria + réplica")]
    Cache[("Redis")]
    Obj[("Almacén de documentos y fotos")]
    Cola["Cola + workers<br/>PDF, QR, correos"]

    Ident["Validación DNI / RUC"]
    Msg["Correo y SMS"]

    Adm --> Portal
    Func --> Portal
    Insp --> Portal
    Caja --> Portal
    Jef --> Portal

    Portal -->|"HTTPS - JSON"| LB
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

    S2 -->|"HTTPS / REST"| Ident
    S7 -->|"HTTPS / REST"| Msg
```

## Reglas de la arquitectura

1. Cada capa solo invoca a la capa inmediatamente inferior.
2. Un módulo no accede a las tablas de otro módulo; lo hace a través de su servicio.
3. Todos los módulos consultan el **Catálogo** para conocer las reglas del TUPA.
4. Las tareas lentas (PDF de esquelas y licencias, QR, correos) van a la cola.
5. Todo corre como una sola aplicación, replicable, con una única base de datos principal.