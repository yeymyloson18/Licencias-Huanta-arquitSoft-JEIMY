# C4 – Nivel 2: Diagrama de contenedores

**Qué muestra:** las aplicaciones y almacenes de datos que forman el sistema, su tecnología y cómo
se comunican. En C4, un "contenedor" es cualquier cosa que se ejecuta o guarda datos (no significa Docker).

```mermaid
flowchart TB
    Adm(["Administrado<br/>[Persona]"])
    Per(["Personal municipal<br/>[Persona]<br/>mesa de partes, evaluador, inspector, caja, jefatura"])
    AdmS(["Administrador del sistema<br/>[Persona]<br/>usuarios, catálogo y feriados"])

    subgraph SIS["Sistema de Trámite de Licencias de Funcionamiento"]
        Portal["Portal Web<br/>[Contenedor: SPA React + TypeScript]<br/>responsive: computadora y celular"]
        Chat["Chatbot<br/>[Contenedor: Fase 2]<br/>lee el catálogo"]
        LB["Balanceador de carga<br/>[Contenedor: servicio cloud o Nginx]"]
        API["Backend API<br/>[Contenedor: Node.js + NestJS]<br/>monolito modular con módulo de Seguridad<br/>JWT + OTP y roles, 2 a N instancias"]
        Workers["Workers<br/>[Contenedor: Node.js]<br/>PDF de esquelas y licencias, QR, correos y SMS<br/>únicos que envían mensajes"]
        Cola["Cola de tareas<br/>[Contenedor]"]
        Redis[("Caché<br/>[Contenedor: Redis]<br/>catálogo y estados")]
        BD[("Base de datos<br/>[Contenedor: PostgreSQL]<br/>primaria + réplica")]
        Obj[("Almacén de documentos<br/>[Contenedor]<br/>PDF, planos y fotos")]
    end

    Ident["Validación DNI / RUC<br/>[Sistema externo]"]
    Msg["Correo y SMS<br/>[Sistema externo]"]
    WA["WhatsApp Business API<br/>[Sistema externo - Fase 2]"]

    Adm -->|"HTTPS"| Portal
    Per -->|"HTTPS"| Portal
    AdmS -->|"HTTPS"| Portal
    Adm -.->|"Fase 2: chat web o WhatsApp"| WA
    WA -.-> Chat

    Portal -->|"HTTPS/JSON"| LB
    Chat -.->|"HTTPS/JSON - misma API"| LB
    LB --> API

    API -->|"SQL"| BD
    API --> Redis
    API --> Obj
    API -->|"encola PDF, QR y mensajes"| Cola
    Cola --> Workers
    Workers --> Obj
    Workers -->|"envía correos y SMS"| Msg

    API -->|"HTTPS/REST"| Ident
```

## Contenedores

| Contenedor | Tecnología propuesta | Responsabilidad | Decisión |
|---|---|---|---|
| Portal Web | React + TypeScript (SPA responsive) | Única entrada, con una vista por perfil; el inspector la usa desde su celular. | ADR-001 |
| Chatbot (Fase 2) | Servicio conectado a la API | Responder con datos del catálogo. | ADR-003 |
| Balanceador de carga | Servicio cloud o Nginx | Repartir las solicitudes entre las instancias. | ADR-005 |
| Backend API | Node.js + NestJS | Monolito modular con Clean Architecture; incluye el módulo Seguridad y Usuarios (JWT + OTP, roles); sin estado para poder replicarse. | ADR-001, ADR-003, ADR-007 |
| Workers + cola | Node.js + cola de tareas | PDF de esquelas y licencias, QR, y envío de correos y SMS en segundo plano. Son los únicos que envían mensajes. | ADR-005 |
| Caché | Redis | Catálogo y estado de trámites. | ADR-005 |
| Base de datos | PostgreSQL con réplica | Toda la información del sistema. | ADR-001, ADR-005 |
| Almacén de documentos | Almacenamiento de objetos | Archivos pesados fuera de la base de datos. | ADR-005 |

Las tecnologías son **propuestas**: la arquitectura no depende de ellas gracias a Clean Architecture.