# Enfoque arquitectónico: Clean Architecture

| Elemento | Descripción aplicada al Sistema de Licencias de Huanta |
|---|---|
| Patrón / enfoque | Clean Architecture (Arquitectura Limpia). |
| Objetivo | Proteger las reglas del trámite (catálogo, rutas, tasas y plazos) y hacer que todas las dependencias apunten hacia el dominio. |
| ¿Qué problema resuelve? | Evita que las reglas del TUPA dependan de PostgreSQL, React, el servicio de DNI/RUC o el servicio de correo. |
| Capas definidas | Dominio, Aplicación, Infraestructura y Presentación. |
| Beneficios | Las reglas se prueban sin base de datos; se cambia una tecnología sin tocar el negocio; el chatbot (Fase 2) se agrega como otro adaptador. |
| Driver que responde | DA08 - Independencia del negocio (y DA01). |

## Cómo se organizan las responsabilidades

| Capa | Qué contiene | Ejemplos en el sistema |
|---|---|---|
| **1. Dominio** (centro) | Entidades, objetos de valor, reglas y **contratos** | Entidades: `Expediente`, `Receta`, `Requisito`, `Esquela`, `Inspeccion`, `Licencia`, `CertificadoITSE`. Objetos de valor: `Tasa`, `PlazoDiasHabiles`, `Ruta` (A, B, C), `EstadoExpediente`, `DniRuc`, `CodigoEsquela`. Contratos: `RepositorioCatalogo`, `RepositorioExpedientes`, `RepositorioEsquelas`, `ConsultaTasa`, `ConsultaExpedientes`, `ValidadorIdentidad`, `Notificador`, `AlmacenDocumentos`, `CalendarioHabil`, `PublicadorEventos`. |
| **2. Aplicación** | Casos de uso: orquestan el dominio usando contratos | `ProponerLicencia`, `RegistrarSolicitud`, `GenerarEsquela`, `RegistrarPagoEnCaja`, `AsignarInspeccion`, `RegistrarResultadoITSE`, `EmitirLicencia`, `VerificarPlazos` |
| **3. Infraestructura** | Adaptadores que **implementan** los contratos | `RepositorioExpedientesPostgres`, `RepositorioEsquelasPostgres`, `RepositorioCatalogoConCache` (Redis), `ConsultaTasaCatalogo`, `ConsultaExpedientesTramites`, `AdaptadorValidacionDniRuc`, `NotificadorEnCola`, `AlmacenObjetos`, `CalendarioFeriadosPostgres` |
| **4. Presentación** | Adaptadores de entrada | Controladores REST, tarea programada del reloj de plazos, chatbot (Fase 2) |

## Reglas de negocio que viven en el dominio

1. Una receta define requisitos, tasa, plazo, calificación, orden del ITSE y vigencia.
2. La ruta A emite la licencia antes del ITSE (ITSE posterior); la ruta B exige evaluación previa e ITSE favorable antes de emitir (si es desfavorable, se deniega); la ruta C emite una provisional gratuita de 12 meses, sin esquela, con ITSE dentro de los 6 meses. En las rutas A y C, si la ITSE es desfavorable, el caso se deriva a fiscalización (fuera del alcance del sistema).
3. Una esquela tiene un código único y **solo puede pagarse una vez**; su monto se toma **siempre** del catálogo.
4. Una licencia no se emite si la esquela no está pagada (salvo la ruta C, que es gratuita).
5. La esquela se genera solo cuando el nivel de riesgo está confirmado; si el evaluador lo corrige, el expediente toma la receta del nuevo nivel antes de generarla.
6. El plazo se cuenta en días hábiles desde la presentación completa.
7. El administrado solo ve su expediente si ingresa el número de expediente **y** su DNI/RUC.

## Regla de dependencia

1. El **dominio** no importa nada de frameworks, base de datos ni servicios externos.
2. Los **casos de uso** solo conocen entidades y contratos.
3. La **infraestructura** implementa los contratos; sus adaptadores son intercambiables.
4. Un único lugar (la raíz de composición, `app.module`) decide qué adaptador cumple cada contrato.

## Diagrama del enfoque

```mermaid
flowchart LR
    subgraph ENTRADA["PRESENTACIÓN - adaptadores de entrada"]
        Ctrl["Controladores REST<br/>Portal Web"]
        Cron["Tarea programada<br/>reloj de plazos"]
        Bot["Chatbot - Fase 2"]
    end

    subgraph APP["APLICACIÓN - casos de uso"]
        U1["ProponerLicencia"]
        U2["RegistrarSolicitud"]
        U3["GenerarEsquela"]
        U4["RegistrarPagoEnCaja"]
        U5["EmitirLicencia"]
        U6["VerificarPlazos"]
    end

    subgraph DOM["DOMINIO - núcleo sin dependencias externas"]
        subgraph ENT["Entidades y reglas"]
            Receta["Receta"]
            Exp["Expediente"]
            Esq["Esquela"]
            Lic["Licencia"]
        end
        subgraph PUERTOS["Contratos - puertos"]
            P1["«interface» RepositorioCatalogo"]
            P2["«interface» RepositorioExpedientes"]
            P3["«interface» RepositorioEsquelas"]
            P4["«interface» ValidadorIdentidad"]
            P5["«interface» Notificador"]
            P6["«interface» CalendarioHabil"]
            P7["«interface» ConsultaTasa"]
            P8["«interface» ConsultaExpedientes"]
            P9["«interface» PublicadorEventos"]
        end
    end

    subgraph INFRA["INFRAESTRUCTURA - adaptadores de salida"]
        A1["RepositorioCatalogoConCache<br/>PostgreSQL + Redis"]
        A2["RepositorioExpedientesPostgres"]
        A3["RepositorioEsquelasPostgres"]
        A4["AdaptadorValidacionDniRuc"]
        A5["NotificadorEnCola"]
        A6["CalendarioFeriadosPostgres"]
        A7["ConsultaTasaCatalogo<br/>usa la fachada del Catálogo"]
        A8["ConsultaExpedientesTramites<br/>usa la fachada de Trámites"]
        A9["PublicadorEventosNest"]
    end

    Ctrl --> U1
    Ctrl --> U2
    Ctrl --> U3
    Ctrl --> U4
    Ctrl --> U5
    Cron --> U6
    Bot -.->|"misma API"| U1

    U1 -.-> Receta
    U2 -.-> Exp
    U3 -.-> Esq
    U4 -.-> Esq
    U5 -.-> Lic
    U1 -.-> P1
    U2 -.-> P2
    U2 -.-> P4
    U3 -.-> P3
    U3 -.-> P7
    U4 -.-> P3
    U4 -.-> P9
    U5 -.-> P5
    U6 -.-> P6
    U6 -.-> P8

    A1 -.->|"implementa"| P1
    A2 -.->|"implementa"| P2
    A3 -.->|"implementa"| P3
    A4 -.->|"implementa"| P4
    A5 -.->|"implementa"| P5
    A6 -.->|"implementa"| P6
    A7 -.->|"implementa"| P7
    A8 -.->|"implementa"| P8
    A9 -.->|"implementa"| P9
```

**Leyenda:** flecha continua = llamada en tiempo de ejecución; flecha punteada = dependencia de código, siempre hacia el dominio; "implementa" = el adaptador cumple el contrato (inversión de dependencias).

## Diferencia con el estilo arquitectónico

| | Estilo (estilo-arquitectonico.md) | Enfoque (este archivo) |
|---|---|---|
| Responde | ¿Cómo es el sistema globalmente? | ¿Cómo se organiza el código por dentro? |
| Decisión | Monolito modular en capas | Clean Architecture |
| Dependencias | De arriba hacia abajo en tiempo de ejecución | Hacia el dominio en el código (invertidas) |