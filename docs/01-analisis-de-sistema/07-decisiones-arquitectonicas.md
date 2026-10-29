# Decisiones arquitectónicas (ADR)

Un **ADR (Architecture Decision Record)** documenta una decisión importante, su contexto,
las alternativas evaluadas y sus consecuencias.

## Resumen

| ID | Decisión arquitectónica | Driver relacionado | Justificación | Resultado |
|---|---|---|---|---|
| ADR-001 | Monolito modular | DA07, DA02 | Una sola aplicación desplegable, organizada en módulos, simple de construir y operar para un equipo pequeño. | Módulos de Catálogo, Trámites, Pagos en caja, Inspecciones, Licencias, Notificaciones, Reloj de plazos, Reportes y Seguridad. |
| ADR-002 | Motor único + catálogo de recetas | DA01 | Las 9 licencias siguen los mismos pasos; lo que cambia se guarda como datos. | Un cambio de tasa, requisito o plazo del TUPA se actualiza en el catálogo, no en el código. |
| ADR-003 | Clean Architecture | DA08 | Separar las reglas del trámite de los detalles tecnológicos. | Capas Dominio, Aplicación, Infraestructura y Presentación. |
| ADR-004 | Pago presencial con esquela | DA04 | El TUPA indica el pago en la caja de la Municipalidad. | El sistema genera la esquela y el personal de caja registra el pago. |
| ADR-005 | Escalamiento horizontal con caché y cola | DA02, DA06 | Soportar de 1,000 a 10,000 usuarios y seguir operando si falla un servidor. | Varias instancias, balanceador, Redis, réplica de base de datos y workers. |
| ADR-006 | Reloj de plazos como tarea programada | DA05 | Contar días hábiles y alertar antes del vencimiento. | Proceso diario con calendario de feriados. |
| ADR-007 | Seguridad por capas | DA03 | Proteger datos personales y operaciones del personal. | OTP, roles, TLS 1.3, AES-256 y QR público con datos mínimos. |

---

## ADR-001: Monolito modular
- **Contexto:** la Municipalidad tiene un equipo de TI pequeño y el trámite es transaccional (expediente, pago, inspección y licencia deben ser consistentes).
- **Alternativas:** microservicios; monolito sin módulos.
- **Decisión:** una sola aplicación con módulos de límites claros y una base PostgreSQL.
- **Consecuencias:** ✅ simple de construir, probar y desplegar; ✅ transacciones normales; ✅ se puede extraer un módulo en el futuro. ⚠️ se escala la aplicación completa.

## ADR-002: Motor único + catálogo de recetas
- **Contexto:** las 9 licencias difieren solo en 6 datos: requisitos, tasa, plazo, calificación, orden del ITSE y vigencia.
- **Alternativas:** programar 9 flujos distintos.
- **Decisión:** un motor que sigue la receta del catálogo; las reglas del TUPA se guardan como datos.
- **Consecuencias:** ✅ cambiar una tasa o un requisito no exige programar; ✅ las reglas viven en un solo lugar. ⚠️ el administrador del sistema debe mantener el catálogo actualizado.

## ADR-003: Clean Architecture
- **Contexto:** las reglas del trámite son lo más valioso y estable; la tecnología puede cambiar y habrá una Fase 2 (chatbot).
- **Alternativas:** capas tradicionales donde el negocio depende de la base de datos; MVC.
- **Decisión:** dominio en el centro; los casos de uso usan contratos; la infraestructura implementa esos contratos con adaptadores.
- **Consecuencias:** ✅ las reglas se prueban sin base de datos; ✅ se cambia la base de datos o el servicio de DNI/RUC sin tocar el negocio; ✅ el chatbot será otro adaptador de entrada. ⚠️ más archivos e interfaces.

## ADR-004: Pago presencial con esquela
- **Contexto:** el TUPA indica el pago en efectivo en la Caja de la Entidad; no se incluyen pagos digitales.
- **Alternativas:** pasarela de pago digital (descartada por alcance y por el TUPA vigente).
- **Decisión:** el sistema calcula la tasa desde el catálogo y genera una esquela en PDF con un código único; el personal de caja cobra y registra el pago con ese código y el número de recibo.
- **Consecuencias:** ✅ sin integraciones externas de pago, más simple y barato; ✅ una esquela solo puede pagarse una vez. ⚠️ el trámite avanza recién cuando caja registra el pago.

## ADR-005: Escalamiento horizontal con caché y cola
- **Contexto:** campañas de formalización y renovaciones del ITSE generan picos de 1,000 a 10,000 usuarios.
- **Alternativas:** un servidor grande; microservicios.
- **Decisión:** backend sin estado con varias instancias detrás de un balanceador, Redis para el catálogo y los estados, réplica de PostgreSQL y workers para generar PDF, QR y correos.
- **Consecuencias:** ✅ crece según la demanda; ✅ sigue operando si falla una instancia. ⚠️ infraestructura más compleja que un solo servidor.

## ADR-006: Reloj de plazos como tarea programada
- **Contexto:** los plazos del TUPA se cuentan en días hábiles y su vencimiento tiene efectos legales (Ley N.° 27444).
- **Alternativas:** control manual del evaluador.
- **Decisión:** un proceso diario que usa un calendario de feriados y alerta a la jefatura.
- **Consecuencias:** ✅ ningún plazo pasa desapercibido. ⚠️ el calendario de feriados debe mantenerse actualizado.

## ADR-007: Seguridad por capas
- **Contexto:** se manejan datos personales (Ley N.° 29733) y decisiones administrativas.
- **Decisión:** OTP para el personal, roles, TLS 1.3, AES-256 en reposo y QR público con datos mínimos.
- **Consecuencias:** ✅ cada rol solo hace lo suyo (por ejemplo, solo caja registra pagos). ⚠️ mayor gestión de credenciales.