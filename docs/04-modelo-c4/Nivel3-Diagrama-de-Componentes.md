# C4 – Nivel 3: Diagrama de componentes

**Qué muestra:** los componentes que hay **dentro del contenedor Backend API**.
Cada componente es un **módulo del monolito modular**.

El diagrama completo, con la tabla de responsabilidades y la trazabilidad de cada componente, está en:

➡️ [`docs/02-arquitectura-software/componentes-arquitectonicos.md`](../02-arquitectura-software/componentes-arquitectonicos.md)

## Vista resumida

```mermaid
flowchart LR
    Front["Portal Web"] -->|"HTTPS/JSON"| Rest["API REST<br/>autenticación, roles, validación"]

    subgraph API["Backend API - monolito modular"]
        Rest --> Cat["Catálogo y Asistente de ruta"]
        Rest --> Tra["Trámites"]
        Rest --> Pag["Pagos en caja"]
        Rest --> Ins["Inspecciones"]
        Rest --> Lic["Licencias"]
        Rest --> Rep["Reportes"]
        Pla["Reloj de plazos"]
        Not["Notificaciones"]

        Tra -->|"lee receta"| Cat
        Pag -->|"lee tasa"| Cat
        Tra -->|"solicita esquela"| Pag
        Pag -.->|"pago registrado"| Tra
        Tra --> Ins
        Tra --> Lic
        Pla --> Tra
        Pla --> Not
        Tra -.->|"eventos"| Not
    end

    Tra --> Ident["Validación DNI / RUC"]
    Not --> Msg["Correo y SMS"]
    API --> BD[("PostgreSQL")]
```

## Reglas del nivel de componentes

1. Todos los componentes se despliegan juntos (monolito modular, ADR-001).
2. Un componente usa a otro solo por su fachada pública o por eventos; nunca por sus tablas.
3. Todos consultan el Catálogo para aplicar las reglas del TUPA (ADR-002).
4. Dentro de cada componente se aplica Clean Architecture (ADR-003); ese detalle se ve en el Nivel 4.