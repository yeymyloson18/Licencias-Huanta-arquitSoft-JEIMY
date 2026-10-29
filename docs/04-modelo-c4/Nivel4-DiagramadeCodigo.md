# C4 – Nivel 4: Diagrama de código

**Qué muestra:** las clases e interfaces de un componente. Se documenta el componente
**Pagos en caja**, porque concentra la decisión ADR-004 (pago presencial con esquela) y muestra
Clean Architecture (ADR-003).

```mermaid
classDiagram
    direction LR

    class Esquela {
        -codigo: CodigoEsquela
        -numeroExpediente: NumeroExpediente
        -monto: Monto
        -numeroRecibo: NumeroRecibo
        +registrarPago(recibo: NumeroRecibo) void
        +estaPagada() boolean
    }

    class CodigoEsquela {
        <<objeto de valor>>
        +generar(numeroExpediente, secuencial) CodigoEsquela
    }

    class PagoRegistrado {
        <<evento>>
        +codigoEsquela
        +numeroExpediente
        +numeroRecibo
    }

    class RepositorioEsquelas {
        <<interface>>
        +buscarPorCodigo(codigo: CodigoEsquela) Esquela
        +contarPorExpediente(numero: NumeroExpediente) number
        +guardar(esquela: Esquela) void
    }

    class ConsultaTasa {
        <<interface>>
        +tasaDe(codigoReceta: string) Monto
    }

    class GeneradorDocumentos {
        <<interface>>
        +generarPdfEsquela(esquela: Esquela) void
    }

    class PublicadorEventos {
        <<interface>>
        +publicar(evento: PagoRegistrado) void
    }

    class GenerarEsquela {
        <<caso de uso>>
        +ejecutar(numeroExpediente, codigoReceta) Esquela
    }

    class RegistrarPagoEnCaja {
        <<caso de uso>>
        +ejecutar(codigo: CodigoEsquela, recibo: NumeroRecibo) void
    }

    class RepositorioEsquelasPostgres {
        <<adaptador>>
    }

    class ConsultaTasaCatalogo {
        <<adaptador>>
        usa la fachada del módulo Catálogo
    }

    class GeneradorPdf {
        <<adaptador>>
        encola el PDF para el worker
    }

    class PublicadorEventosNest {
        <<adaptador>>
    }

    class PagosController {
        <<presentación>>
        +registrarPago(peticion) Respuesta
    }

    class ModuloPagos {
        <<fachada>>
        +generarEsquela(numeroExpediente, codigoReceta) Esquela
    }

    ModuloPagos --> GenerarEsquela : invoca
    PagosController --> RegistrarPagoEnCaja : invoca
    GenerarEsquela --> ConsultaTasa : usa
    GenerarEsquela --> RepositorioEsquelas : usa
    GenerarEsquela --> GeneradorDocumentos : usa
    GenerarEsquela ..> Esquela : crea
    GenerarEsquela ..> CodigoEsquela : usa
    RegistrarPagoEnCaja --> RepositorioEsquelas : usa
    RegistrarPagoEnCaja --> PublicadorEventos : usa
    RegistrarPagoEnCaja ..> PagoRegistrado : crea
    RepositorioEsquelasPostgres ..|> RepositorioEsquelas : implementa
    ConsultaTasaCatalogo ..|> ConsultaTasa : implementa
    GeneradorPdf ..|> GeneradorDocumentos : implementa
    PublicadorEventosNest ..|> PublicadorEventos : implementa
```

## Cómo leer el diagrama

| Capa | Clases |
|---|---|
| **Dominio** | `Esquela`, `CodigoEsquela`, `PagoRegistrado` y los contratos `RepositorioEsquelas`, `ConsultaTasa`, `GeneradorDocumentos` y `PublicadorEventos` |
| **Aplicación** | `GenerarEsquela`, `RegistrarPagoEnCaja` y la fachada `ModuloPagos` |
| **Infraestructura** | `RepositorioEsquelasPostgres`, `ConsultaTasaCatalogo`, `GeneradorPdf`, `PublicadorEventosNest` |
| **Presentación** | `PagosController` (solo el rol de caja puede registrar pagos) |

**Reglas del dominio:**
- `Esquela.registrarPago()` rechaza el registro si la esquela ya fue pagada.
- El monto **no se recibe desde afuera**: `GenerarEsquela` lo pide al catálogo mediante `ConsultaTasa` (RF05, ADR-002).
- El código es único: `ESQ-<expediente>-<secuencial>`, y la base de datos tiene una restricción UNIQUE sobre él.

**Límite del módulo:** `Expediente` **no aparece** aquí porque pertenece al módulo Trámites. Pagos no lo
modifica: solo publica `PagoRegistrado`, y Trámites reacciona marcando su expediente como pagado.

Las flechas `..|>` muestran la **inversión de dependencias**: los adaptadores dependen de los contratos
del dominio, nunca al revés. El código de ejemplo está en `tecnologia/README.md`.