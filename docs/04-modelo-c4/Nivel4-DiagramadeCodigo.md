# C4 – Nivel 4: Diagrama de código

**Qué muestra:** las clases e interfaces de un componente. Se documenta el componente
**Pagos en caja**, porque concentra la decisión ADR-004 (pago presencial con esquela) y muestra
Clean Architecture (ADR-003).

```mermaid
classDiagram
    direction LR

    class Expediente {
        -numero: NumeroExpediente
        -estado: EstadoExpediente
        -receta: Receta
        +tasaAPagar() Monto
        +marcarPagado() void
        +estaPagado() boolean
    }

    class Receta {
        -tasa: Monto
        -plazo: PlazoDiasHabiles
        -ruta: RutaTramite
    }

    class Esquela {
        -codigo: CodigoEsquela
        -numeroExpediente: NumeroExpediente
        -monto: Monto
        -numeroRecibo: NumeroRecibo
        -pagada: boolean
        +registrarPago(recibo: NumeroRecibo) void
        +estaPagada() boolean
    }

    class RepositorioEsquelas {
        <<interface>>
        +buscarPorCodigo(codigo: CodigoEsquela) Esquela
        +guardar(esquela: Esquela) void
    }

    class GeneradorDocumentos {
        <<interface>>
        +generarPdfEsquela(esquela: Esquela) Documento
    }

    class GenerarEsquela {
        <<caso de uso>>
        +ejecutar(numero: NumeroExpediente) Esquela
    }

    class RegistrarPagoEnCaja {
        <<caso de uso>>
        +ejecutar(codigo: CodigoEsquela, recibo: NumeroRecibo) void
    }

    class RepositorioEsquelasPostgres {
        <<adaptador>>
    }

    class GeneradorPdf {
        <<adaptador>>
    }

    class PagosController {
        <<presentación>>
        +generarEsquela(peticion) Respuesta
        +registrarPago(peticion) Respuesta
    }

    Expediente --> Receta : obtiene la tasa
    PagosController --> GenerarEsquela : invoca
    PagosController --> RegistrarPagoEnCaja : invoca
    GenerarEsquela --> RepositorioEsquelas : usa
    GenerarEsquela --> GeneradorDocumentos : usa
    GenerarEsquela ..> Esquela : crea
    GenerarEsquela ..> Expediente : lee la tasa
    RegistrarPagoEnCaja --> RepositorioEsquelas : usa
    RepositorioEsquelasPostgres ..|> RepositorioEsquelas : implementa
    GeneradorPdf ..|> GeneradorDocumentos : implementa
```

## Cómo leer el diagrama

| Capa | Clases |
|---|---|
| **Dominio** | `Expediente`, `Receta`, `Esquela` y los contratos `RepositorioEsquelas` y `GeneradorDocumentos` |
| **Aplicación** | `GenerarEsquela`, `RegistrarPagoEnCaja` |
| **Infraestructura** | `RepositorioEsquelasPostgres`, `GeneradorPdf` |
| **Presentación** | `PagosController` (solo el rol de caja puede registrar pagos) |

**Regla del dominio:** `Esquela.registrarPago()` rechaza el registro si la esquela ya fue pagada.

Las flechas `..|>` muestran la **inversión de dependencias**: los adaptadores dependen de los contratos
del dominio, nunca al revés. El código de ejemplo está en `tecnologia/README.md`.