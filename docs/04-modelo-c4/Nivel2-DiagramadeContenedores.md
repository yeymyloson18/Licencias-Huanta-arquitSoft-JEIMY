# C4 – Nivel 2: Diagrama de contenedores

**Qué muestra:** las aplicaciones y almacenes de datos que forman el sistema, la tecnología de cada
uno y cómo se comunican. En C4, un "contenedor" es cualquier cosa que se ejecuta o guarda datos
(no significa Docker).

```mermaid
flowchart TB
    Adm(["Administrado<br/>[Persona]"])
    Per(["Personal municipal y Jefatura<br/>[Persona]"])
    Insp(["Inspector ITSE<br/>[Persona]"])

    subgraph SIS["Sistema de Trámite de Licencias de Funcionamiento"]
        Portal["Portal Web<br/>[Contenedor: SPA React + TypeScript]<br/>vista para administrado, personal y jefatura"]
        PWA["PWA de inspectores<br/>[Contenedor: React instalable]<br/>trabajo sin conexión y sincronización"]
        Chat["Chatbot<br/>[Contenedor: servicio de IA - Fase 2]<br/>lee el catálogo, no inventa"]
        LB["Balanceador de carga + CDN + firewall web<br/>[Contenedor: servicio cloud]"]
        API["Backend API<br/>[Contenedor: Node.js + NestJS]<br/>monolito modular, 2 a N réplicas"]
        Workers["Workers<br/>[Contenedor: Node.js]<br/>PDF, QR, correos, SMS"]
        Cola["Cola de mensajes<br/>[Contenedor]"]
        Redis[("Caché<br/>[Contenedor: Redis]<br/>catálogo, sesiones, límites")]
        BD[("Base de datos<br/>[Contenedor: PostgreSQL]<br/>primaria + réplicas de lectura")]
        Obj[("Almacén de documentos<br/>[Contenedor: almacenamiento de objetos]<br/>PDF, planos y fotos")]
    end

    Pasarela["Pasarela de pago<br/>[Sistema externo]"]
    Ident["Validación DNI / RUC<br/>[Sistema externo]"]
    Msg["Correo y SMS<br/>[Sistema externo]"]
    WA["WhatsApp Business API<br/>[Sistema externo]"]
    SIAF["SIAF-SP / Trámite documentario<br/>[Sistemas municipales]"]

    Adm -->|"HTTPS"| Portal
    Per -->|"HTTPS"| Portal
    Insp -->|"HTTPS"| PWA
    Adm -.->|"chat web o WhatsApp"| WA
    WA -.-> Chat

    Portal -->|"HTTPS/JSON"| LB
    PWA -->|"HTTPS/JSON, al sincronizar"| LB
    Chat -.->|"HTTPS/JSON - misma API"| LB
    LB --> API

    API -->|"SQL"| BD
    API --> Redis
    API -->|"URL firmadas"| Obj
    API -->|"publica tareas"| Cola
    Cola --> Workers
    Workers --> Obj
    Workers --> Msg

    API -->|"HTTPS/REST"| Pasarela
    Pasarela -.->|"webhook de confirmación"| API
    API -->|"HTTPS/REST"| Ident
    API -->|"API"| SIAF
```

## Contenedores

| Contenedor | Tecnología propuesta | Responsabilidad | Decisión |
|---|---|---|---|
| Portal Web | React + TypeScript (SPA responsive) | Única entrada web, con una vista por perfil. | ADR-001 |
| PWA de inspectores | React instalable | Registrar la ITSE sin conexión y sincronizar. | ADR-008 |
| Chatbot (Fase 2) | Servicio de IA conectado a la API | Responder con datos del catálogo; derivar a una persona. | ADR-003 |
| Balanceador + CDN + firewall | Servicio del proveedor cloud | Repartir carga, servir archivos estáticos y bloquear abusos. | ADR-005 |
| Backend API | Node.js + NestJS | Monolito modular con Clean Architecture; sin estado para poder replicarse. | ADR-001, ADR-003 |
| Workers + cola | Node.js + cola de mensajes | Tareas lentas en segundo plano. | ADR-005 |
| Caché | Redis | Catálogo, estado de trámites, sesiones y límite de solicitudes. | ADR-005 |
| Base de datos | PostgreSQL con réplicas | Toda la información; escrituras en la primaria y lecturas en réplicas. | ADR-001, ADR-005 |
| Almacén de documentos | Almacenamiento de objetos | Archivos pesados fuera de la base de datos. | ADR-005 |

Las tecnologías son **propuestas** (etapa 11 del proceso): la arquitectura no depende de ellas gracias a Clean Architecture.