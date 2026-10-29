# Drivers arquitectónicos

Un driver es un requisito, atributo de calidad o restricción que **cambia la forma de diseñar** el sistema.

| ID | Driver arquitectónico | Origen | Decisión arquitectónica que provoca |
|---|---|---|---|
| DA01 | Las 9 licencias siguen casi los mismos pasos; sus diferencias (requisitos, tasa, plazo, calificación, orden del ITSE y vigencia) deben estar en datos y no en el código. | AC06 – Mantenibilidad · RC01 – TUPA | Un solo **motor de trámites** y un **catálogo de 9 recetas** que todos los módulos consultan. |
| DA02 | El sistema debe soportar de 1,000 a 10,000 usuarios simultáneos con buen tiempo de respuesta. | AC01 – Rendimiento · AC04 – Escalabilidad | Backend sin estado con **varias instancias detrás de un balanceador**, **caché Redis** y **cola de tareas** para PDF, QR y correos. |
| DA03 | Los datos personales y las operaciones del personal deben estar protegidos. | AC02 – Seguridad · RC05 – Ley 29733 | Autenticación con **OTP**, control de acceso por **roles**, cifrado **TLS 1.3** y **AES-256**, y QR público con datos mínimos. |
| DA04 | El pago se realiza solo en la caja de la Municipalidad. | RC11 – Pago presencial en caja | **Esquela de pago** con código único y registro del pago por el personal de caja. |
| DA05 | Los plazos deben contarse en días hábiles y alertar a tiempo. | RF08 · RF23 · RC04 – Ley 27444 |Componente **Reloj de plazos** como tarea programada con calendario de feriados. |
| DA06 | El sistema debe seguir disponible si falla un servidor. | AC03 – Disponibilidad | Mínimo **dos instancias** del backend y base de datos con **réplica de respaldo**. |
| DA07 | El sistema debe ser simple de construir y mantener para un equipo de TI pequeño. | AC06 – Mantenibilidad | **Monolito modular** con una sola base de datos, en lugar de microservicios. |
| DA08 | Las reglas del trámite no deben depender de la tecnología, y la Fase 2 debe agregarse sin rehacer la Fase 1. | AC06 – Mantenibilidad · RC13 – Dos fases | **Clean Architecture**: dominio en el centro y adaptadores intercambiables; el chatbot será un canal más de la misma API. |

## Relación entre drivers y decisiones

| Driver | Problema que plantea | Decisión que responde | ADR |
|---|---|---|---|
| DA01 - Catálogo de recetas | 9 licencias con reglas distintas | Motor único + catálogo de recetas | ADR-002 |
| DA02 - Escalabilidad y rendimiento | De 1,000 a 10,000 usuarios en campañas | Varias instancias, caché Redis y cola de tareas | ADR-005 |
| DA03 - Seguridad | Datos personales y Ley 29733 | OTP, roles, TLS 1.3 y AES-256 | ADR-007 |
| DA04 - Pago en caja | No hay pagos digitales | Esquela de pago y registro en caja | ADR-004 |
| DA05 - Plazos | Riesgo de silencio positivo | Reloj de plazos programado | ADR-006 |
| DA06 - Disponibilidad | Un servidor puede fallar | Dos instancias y réplica de base de datos | ADR-005 |
| DA07 - Simplicidad | Equipo de TI municipal pequeño | Monolito modular | ADR-001 |
| DA08 - Independencia del negocio | La tecnología puede cambiar; habrá Fase 2 | Clean Architecture | ADR-003 |