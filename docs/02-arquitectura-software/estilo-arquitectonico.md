# Estilo arquitectónico

## Estilo seleccionado
**Monolito modular organizado en capas** (ADR-001).

- **Monolito:** el backend es una sola aplicación API REST con un solo despliegue, que se replica en los picos.
- **Modular:** se divide en módulos con límites claros: Seguridad y Usuarios, Catálogo y Asistente de ruta, Trámites, Pagos en caja, Inspecciones, Licencias, Reloj de plazos, Notificaciones y Reportes.
- **En capas:** cada módulo tiene Presentación (controladores), Lógica de negocio (casos de uso y reglas) y Datos (repositorios). Los repositorios **implementan contratos definidos por la lógica de negocio** (Clean Architecture, ADR-003).
- **Centrado en el catálogo:** los módulos consultan el Catálogo para aplicar las reglas del TUPA (ADR-002).

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
        AdmS["Administrador del sistema"]
    end

    Portal["Portal Web responsive<br/>computadora y celular"]
    LB["Balanceador de carga"]

    subgraph MONOLITO["MONOLITO MODULAR - Backend API REST - un solo despliegue, N instancias"]
        MW["Middlewares transversales<br/>autenticación JWT + OTP - roles - validación"]

        subgraph PRES["1. PRESENTACIÓN - controladores REST y tareas programadas"]
            C0["seguridad.controller"]
            C1["catalogo.controller"]
            C2["tramites.controller"]
            C3["pagos.controller"]
            C4["inspecciones.controller"]
            C5["licencias.controller"]
            C6["reportes.controller"]
            T1["tareas diarias<br/>plazos y aviso ITSE"]
        end

        subgraph NEG["2. LÓGICA DE NEGOCIO - casos de uso, reglas y contratos"]
            Seg["Seguridad y Usuarios<br/>cuentas, roles, OTP"]
            Cat["CATÁLOGO<br/>9 recetas"]
            S2["Trámites<br/>expediente y estados"]
            S3["Pagos en caja<br/>esquela y registro"]
            S4["Inspecciones<br/>ITSE y resultado"]
            S5["Licencias<br/>emisión y QR"]
            S6["Reportes"]
            S7["Notificaciones<br/>encola avisos"]
            S8["Reloj de plazos"]
        end

        subgraph DAT["3. DATOS - adaptadores"]
            R["Repositorios por módulo + ORM<br/>implementan los contratos del negocio"]
        end
    end

    BD[("PostgreSQL<br/>primaria + réplica")]
    Cache[("Redis")]
    Obj[("Almacén de documentos y fotos")]
    Cola["Cola + workers<br/>PDF, QR, correos y SMS"]

    Ident["Validación DNI / RUC"]
    Msg["Correo y SMS"]

    Adm --> Portal
    Func --> Portal
    Insp --> Portal
    Caja --> Portal
    Jef --> Portal
    AdmS --> Portal

    Portal -->|"HTTPS - JSON"| LB
    LB --> MW
    MW -->|"valida sesión y rol"| Seg
    MW --> PRES

    C0 --> Seg
    C1 --> Cat
    C2 --> S2
    C3 --> S3
    C4 --> S4
    C5 --> S5
    C6 --> S6
    T1 --> S8
    T1 --> S5

    S2 -.->|"consulta reglas"| Cat
    S3 -.->|"consulta tasa"| Cat
    S4 -.->|"consulta ruta"| Cat
    S5 -.->|"consulta vigencia"| Cat
    S8 -.->|"consulta plazos"| Cat

    NEG -->|"llama a través de contratos"| R
    R -.->|"implementa contratos"| NEG
    R --> BD
    R --> Cache
    R --> Obj
    S7 -->|"encola"| Cola
    Cola -->|"envía"| Msg

    S2 -->|"HTTPS / REST"| Ident
```

**Leyenda:** flecha continua = llamada en tiempo de ejecución; flecha punteada = dependencia de código (consulta a otro módulo o "implementa contrato").

## Reglas de la arquitectura

1. En tiempo de ejecución, la petición fluye Presentación → Lógica de negocio → Datos. En el código, la capa de Datos **depende** de la lógica de negocio porque implementa sus contratos (inversión de dependencias, ADR-003).
2. Un módulo no accede a las tablas ni a los repositorios de otro módulo; lo hace a través de su fachada pública o de eventos.
3. Los módulos consultan el **Catálogo** para conocer las reglas del TUPA.
4. Las tareas lentas (PDF de esquelas y licencias, QR, correos y SMS) van a la cola; solo los workers envían mensajes.
5. Todo corre como una sola aplicación, replicable, con una única base de datos principal.