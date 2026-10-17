# Patrones de diseño

Un patrón de diseño es una solución probada para un problema frecuente.
Aquí solo se aplican los patrones que **resuelven un problema real del sistema de licencias**;
cada uno indica dónde se usa y qué driver lo justifica.

## Patrones aplicados

| Patrón | Problema en el sistema de licencias | Dónde se aplica | Driver / ADR |
|---|---|---|---|
| **Strategy** (estrategia) | Las 9 licencias siguen una de **3 rutas** distintas (A, B, C). Con `if/else` por tipo, cada ruta nueva obligaría a modificar el motor. | `RutaTramite` con las implementaciones `RutaA`, `RutaB` y `RutaC`. La receta indica qué estrategia usar. | DA01 · ADR-002 |
| **Repository** (repositorio) | Los casos de uso no deben conocer SQL ni PostgreSQL. | `RepositorioExpedientes`, `RepositorioCatalogo`, `RepositorioPagos`… definidos en el dominio. | DA10 · ADR-003 |
| **Adapter** (adaptador) | La pasarela de pago, el servicio de DNI/RUC, el correo/SMS y WhatsApp tienen interfaces propias. | `AdaptadorPasarelaPago`, `AdaptadorValidacionDniRuc`, `NotificadorCorreoSMS`, adaptador del chatbot (Fase 2). | DA04, DA08 · ADR-003, ADR-004 |
| **Factory** (fábrica) | Crear un expediente exige copiar la versión vigente de la receta, sus requisitos y su ruta. | `FabricaExpediente.crearDesde(versionReceta, solicitante)`. | DA01 · ADR-002 |
| **Chain of Responsibility** (cadena de responsabilidad) | Una solicitud pasa varias validaciones en orden. | Cadena: requisitos completos → identidad DNI/RUC → documentos especiales del giro → zonificación (ruta C). | RF04, RF06 |
| **Facade** (fachada de módulo) | Otros módulos no deben conocer el interior de un módulo. | Cada módulo expone una fachada pública, por ejemplo `ModuloPagos.solicitarCobro()`. | DA09 · ADR-001 |
| **Observer / Eventos de dominio** | Al cambiar el estado de un expediente, varias partes deben reaccionar sin acoplarse. | `PagoConfirmado`, `ResultadoITSERegistrado`, `EstadoExpedienteCambiado` → Notificaciones y Bitácora. | DA05, DA10 |
| **Decorator** (decorador) | El catálogo se consulta mucho y casi no cambia. | `RepositorioCatalogoConCache` envuelve al repositorio real y guarda en Redis. | DA02 · ADR-005 |
| **Circuit Breaker + reintentos** | Si la pasarela o el servicio de DNI/RUC fallan, seguir llamándolos empeora todo. | Alrededor de `AdaptadorPasarelaPago` y `AdaptadorValidacionDniRuc`. | DA04 · ADR-004 |
| **Clave de idempotencia** | Un reintento de pago no debe cobrar dos veces. | `IdentificadorPago` único por intento de pago del expediente. | DA04 · ADR-004 |

**CORS** no es un patrón de diseño, sino una configuración de seguridad del navegador: la API solo
acepta peticiones del dominio oficial del Portal Web de la Municipalidad.

## Ejemplo: Strategy para las rutas del trámite

```typescript
// dominio/RutaTramite.ts
export interface RutaTramite {
  siguientePaso(expediente: Expediente): PasoTramite;
}

// dominio/rutas/RutaA.ts – la licencia primero, ITSE después
export class RutaA implements RutaTramite {
  siguientePaso(e: Expediente): PasoTramite {
    return e.estaPagado() ? PasoTramite.EMITIR_LICENCIA : PasoTramite.ESPERAR_PAGO;
  }
}

// dominio/rutas/RutaB.ts – la inspección primero
export class RutaB implements RutaTramite {
  siguientePaso(e: Expediente): PasoTramite {
    if (!e.estaPagado()) return PasoTramite.ESPERAR_PAGO;
    return e.itseFavorable() ? PasoTramite.EMITIR_LICENCIA : PasoTramite.PROGRAMAR_ITSE;
  }
}
```

El motor solo llama a `expediente.ruta.siguientePaso(expediente)`.
Si apareciera una cuarta ruta, se agrega una clase nueva **sin modificar el motor** (principio abierto/cerrado).

## Patrones que NO se aplican, y por qué

| Patrón | Por qué no |
|---|---|
| **Saga** | Sirve para transacciones entre microservicios; aquí hay una sola base de datos y transacciones normales (ADR-001). |
| **CQRS completo** | Bastan las réplicas de lectura para los reportes; separar modelos de lectura y escritura añadiría complejidad sin beneficio. |
| **Singleton global** | Dificulta las pruebas; las dependencias se inyectan desde la raíz de composición. |
| **State** (patrón de estados) | El ciclo del expediente se controla con una tabla de transiciones en la entidad; un objeto por estado sería sobreingeniería. |

> **Criterio:** un patrón se aplica cuando resuelve un problema presente, no por anticipado (principio YAGNI).