# Patrones de diseño

Solo se aplican los patrones que **resuelven un problema real del sistema de licencias**.
Se eligieron **cinco**, uno por cada problema principal del diseño.

## Patrones aplicados

| Patrón | Problema en el sistema de licencias | Dónde se aplica | Driver / ADR |
|---|---|---|---|
| **Strategy** (estrategia) | Las 9 licencias siguen una de **3 rutas** (A, B, C). Con `if/else` por tipo, cada ruta nueva obligaría a modificar el motor. | `RutaTramite` con las implementaciones `RutaA`, `RutaB` y `RutaC`. La receta indica qué estrategia usar. | DA01 · ADR-002 |
| **Repository** (repositorio) | Los casos de uso no deben conocer SQL ni PostgreSQL. | `RepositorioExpedientes`, `RepositorioCatalogo`, `RepositorioEsquelas`… definidos en el dominio. | DA08 · ADR-003 |
| **Adapter** (adaptador) | El servicio de DNI/RUC, el de correo/SMS, Redis y los otros módulos tienen interfaces propias. | `AdaptadorValidacionDniRuc`, `NotificadorCorreoSMS` (usado por el worker), `ConsultaTasaCatalogo`, `RepositorioCatalogoConCache` (Redis), adaptador del chatbot (Fase 2). | DA08 · ADR-003 |
| **Facade** (fachada de módulo) | Otros módulos no deben conocer el interior de un módulo. | Cada módulo expone una fachada pública, por ejemplo `ModuloPagos.generarEsquela()`. | DA07 · ADR-001 |
| **Observer / Eventos de dominio** | Cuando ocurre algo importante, otros módulos deben reaccionar sin acoplarse. | `PagoRegistrado` → Trámites; `ResultadoITSERegistrado` → Trámites; `EstadoExpedienteCambiado` → Notificaciones. | DA08 |

**CORS** no es un patrón de diseño: es una configuración de seguridad; la API solo acepta peticiones del Portal Web oficial.

## Ejemplo: Strategy para las rutas del trámite

Cada ruta responde una sola pregunta: **¿cuál es el siguiente paso del expediente?** Todas terminan en `FINALIZADO`.

```typescript
// modulos/tramites/dominio/RutaTramite.ts
export interface RutaTramite {
  siguientePaso(expediente: Expediente): PasoTramite;
}

// modulos/tramites/dominio/rutas/RutaA.ts – la licencia primero, ITSE posterior
export class RutaA implements RutaTramite {
  siguientePaso(e: Expediente): PasoTramite {
    if (!e.riesgoConfirmado()) return PasoTramite.VERIFICAR_REQUISITOS;
    if (!e.estaPagado()) return PasoTramite.ESPERAR_PAGO_EN_CAJA;
    if (!e.licenciaEmitida()) return PasoTramite.EMITIR_LICENCIA;
    if (!e.tieneResultadoITSE()) return PasoTramite.PROGRAMAR_ITSE_POSTERIOR;
    return PasoTramite.FINALIZADO;
  }
}

// modulos/tramites/dominio/rutas/RutaB.ts – evaluación primero, luego pago e ITSE previa
export class RutaB implements RutaTramite {
  siguientePaso(e: Expediente): PasoTramite {
    if (e.evaluacionDenegada()) return PasoTramite.DENEGAR;
    if (!e.evaluacionAprobada()) return PasoTramite.EVALUAR;          // aquí se confirma el riesgo
    if (!e.estaPagado()) return PasoTramite.ESPERAR_PAGO_EN_CAJA;    // la esquela ya tiene la tasa correcta
    if (!e.tieneResultadoITSE()) return PasoTramite.PROGRAMAR_ITSE;
    if (!e.itseFavorable()) return PasoTramite.DENEGAR;
    if (!e.licenciaEmitida()) return PasoTramite.EMITIR_LICENCIA;
    return PasoTramite.FINALIZADO;
  }
}

// modulos/tramites/dominio/rutas/RutaC.ts – bodega: gratuita, sin esquela
export class RutaC implements RutaTramite {
  siguientePaso(e: Expediente): PasoTramite {
    if (!e.licenciaEmitida()) return PasoTramite.EMITIR_LICENCIA_PROVISIONAL;
    if (!e.tieneResultadoITSE()) return PasoTramite.PROGRAMAR_ITSE_EN_6_MESES;
    if (!e.cumplio12Meses()) return PasoTramite.ESPERAR_12_MESES;
    if (!e.licenciaDefinitivaEmitida()) return PasoTramite.EMITIR_LICENCIA_DEFINITIVA;
    return PasoTramite.FINALIZADO;
  }
}
```

`estaPagado()` es un dato del propio `Expediente` (módulo Trámites): se marca cuando llega el evento `PagoRegistrado`. Trámites nunca lee las tablas de Pagos.

Si apareciera una cuarta ruta, se agrega una clase nueva **sin modificar el motor** (principio abierto/cerrado).

## Patrones que NO se aplican, y por qué

| Patrón | Por qué no |
|---|---|
| **Factory** | Crear un expediente es simple: el caso de uso `RegistrarSolicitud` copia los requisitos y la ruta de la receta. |
| **Chain of Responsibility** | Las validaciones de la solicitud son pocas y fijas; se hacen en orden dentro de `RegistrarSolicitud`. |
| **Decorator** | La caché del catálogo se resuelve con un adaptador de Redis (`RepositorioCatalogoConCache`); no hace falta nombrarla como otro patrón. |
| **Saga** | Sirve para transacciones entre microservicios; aquí hay una sola base de datos. |
| **CQRS completo** | Los reportes leen de la misma base; separar modelos añadiría complejidad sin beneficio. |
| **Circuit Breaker** | No hay pasarela de pago; el único servicio externo crítico (DNI/RUC) puede validarse después por mesa de partes. |
| **Singleton global** | Dificulta las pruebas; las dependencias se inyectan desde la raíz de composición. |
| **State** (patrón de estados) | El ciclo del expediente se controla con una tabla de transiciones; un objeto por estado sería sobreingeniería. |

> **Criterio:** un patrón se aplica cuando resuelve un problema presente, no por anticipado (principio YAGNI).