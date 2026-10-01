# Drivers arquitectónicos

| ID | Driver arquitectónico | Origen | Decisión arquitectónica que provoca |
|---|---|---|---|
| DA01 | Las nueve licencias deben poder cambiar cuando cambie el TUPA, sin reprogramar. | AC01 – Modificabilidad / RC01 – TUPA | Un solo motor de trámites y un **catálogo versionado de recetas** que todos los módulos consultan. |
| DA02 | El sistema debe soportar de 1,000 a 10,000 usuarios simultáneos en campañas y renovaciones del ITSE. | AC03 – Escalabilidad / AC02 – Rendimiento / AC11 – Elasticidad | Backend sin estado con **autoescalado horizontal** detrás de un **balanceador**; **Redis** para caché, sesiones y límite de solicitudes; **PostgreSQL primaria con réplicas de lectura** y **pool de conexiones**; **workers con cola de mensajes** para PDF, QR y correos; **CDN** y **carga directa de documentos** al almacén. |
| DA03 | Los datos personales y las operaciones deben estar protegidos. | AC05 – Seguridad / RC05 – Ley 29733 | Autenticación con **OTP**, control de acceso por **roles**, cifrado **TLS 1.3** y **AES-256**, y QR público con datos mínimos. |
| DA04 | Un reintento de pago no debe cobrar dos veces. | AC06 – Confiabilidad / RC10 – Pasarela | Cada pago lleva un **identificador único (idempotencia)** antes de enviarse a la pasarela. |
| DA05 | Toda acción debe quedar registrada y no editable. | AC07 – Auditabilidad / RC04 – Ley 27444 | **Bitácora de auditoría** de solo escritura, usada por todos los módulos. |
| DA06 | Los plazos deben contarse en días hábiles y alertar a tiempo. | RF08 / RC04 – Ley 27444 | Componente **Reloj de plazos** como tarea programada con calendario de feriados. |
| DA07 | El inspector debe trabajar sin señal. | AC09 – Operación sin conexión | **App web instalable (PWA)** con almacenamiento local y sincronización posterior. |
| DA08 | La Fase 2 debe agregarse sin rehacer la Fase 1. | RC14 – Dos fases | El chatbot es **un canal más** que consume la misma API y **lee el catálogo**, así no inventa requisitos ni costos. |
| DA09 | El sistema debe ser simple de construir y mantener. | AC10 – Mantenibilidad / RC09 – PostgreSQL | **Monolito modular** con una sola base de datos, en lugar de microservicios. |