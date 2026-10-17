# C4 – Nivel 4: Diagrama de código

**Qué muestra:** las clases e interfaces de un componente. Se documenta solo el componente más
crítico: **Pagos**, junto con su relación con **Trámites** y **Catálogo**, porque concentra las
decisiones ADR-003 (Clean Architecture) y ADR-004 (pago idempotente).

```mermaid
classDiagram
    direction LR

    class Expediente {
        -numero: NumeroExpediente
        -estado: EstadoExpediente
        -versionReceta: VersionReceta
        +tasaAPagar() Monto
        +marcarPagado() void
        +estaPagado() boolean
    }

    class VersionReceta {
        -tasa: Monto
        -plazo: PlazoDiasHabiles
        -ruta: RutaTramite
        -vigenteDesde: Date
    }

    class Pago {
        -id: IdentificadorPago
        -monto: Monto
        -estado: EstadoPago
        +confirmar() void
        +estaConfirmado() boolean
    }

    class PasarelaPago {
        <<interface>>
        +cobrar(id: IdentificadorPago, monto: Monto) ResultadoCobro
    }

    class RepositorioPagos {
        <<interface>>
        +buscarPorId(id: IdentificadorPago) Pago
        +guardar(pago: Pago) void
    }

    class RepositorioExpedientes {
        <<interface>>
        +buscar(numero: NumeroExpediente) Expediente
        +guardar(expediente: Expediente) void
    }

    class PagarTasa {
        <<caso de uso>>
        +ejecutar(numero: NumeroExpediente, id: IdentificadorPago) ResultadoCobro
    }

    class AdaptadorPasarelaPago {
        <<adaptador>>
        +cobrar(id, monto) ResultadoCobro
    }

    class PasarelaPagoSimulada {
        <<adaptador de pruebas>>
        +cobrar(id, monto) ResultadoCobro
    }

    class RepositorioPagosPostgres {
        <<adaptador>>
    }

    class PagosController {
        <<presentación>>
        +pagar(peticion) Respuesta
    }

    Expediente --> VersionReceta : usa la versión con la que empezó
    PagosController --> PagarTasa : invoca
    PagarTasa --> RepositorioExpedientes : usa
    PagarTasa --> RepositorioPagos : usa
    PagarTasa --> PasarelaPago : usa
    PagarTasa ..> Pago : crea
    PagarTasa ..> Expediente : obtiene la tasa
    AdaptadorPasarelaPago ..|> PasarelaPago : implementa
    PasarelaPagoSimulada ..|> PasarelaPago : implementa
    RepositorioPagosPostgres ..|> RepositorioPagos : implementa
```

## Cómo leer el diagrama

| Capa | Clases |
|---|---|
| **Dominio** | `Expediente`, `VersionReceta`, `Pago` y los contratos `PasarelaPago`, `RepositorioPagos`, `RepositorioExpedientes` |
| **Aplicación** | `PagarTasa` |
| **Infraestructura** | `AdaptadorPasarelaPago`, `PasarelaPagoSimulada`, `RepositorioPagosPostgres` |
| **Presentación** | `PagosController` |

**Regla de idempotencia:** antes de cobrar, `PagarTasa` busca el `IdentificadorPago`. Si ese pago ya
existe, devuelve su resultado y **no vuelve a cobrar**.

Las flechas `..|>` muestran la **inversión de dependencias**: los adaptadores dependen de los contratos
del dominio, nunca al revés. El código de ejemplo está en `tecnologia/README.md`.