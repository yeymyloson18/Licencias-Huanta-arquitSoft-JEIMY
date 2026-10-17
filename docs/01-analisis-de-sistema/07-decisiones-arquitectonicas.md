# Decisiones arquitectónicas (ADR)

Un **ADR (Architecture Decision Record)** documenta una decisión importante, su contexto,
las alternativas evaluadas y sus consecuencias.

## Resumen

| ID | Decisión arquitectónica | Driver relacionado | Justificación | Resultado |
|---|---|---|---|---|
| ADR-001 | Monolito modular | DA09, DA02 | Una sola aplicación desplegable, organizada en módulos, simple de construir y operar para un equipo pequeño. | Módulos de Catálogo, Trámites, Pagos, Inspecciones, Licencias, Notificaciones, Reloj de plazos, Reportes y Seguridad. |
| ADR-002 | Motor único + catálogo versionado de recetas | DA01 | Las 9 licencias siguen los mismos pasos; lo que cambia se guarda como datos. | Un cambio del TUPA es una versión nueva, no código nuevo. |
| ADR-003 | Clean Architecture | DA10, DA08 | Separar las reglas del trámite de los detalles tecnológicos. | Capas Dominio, Aplicación, Infraestructura y Presentación. |
| ADR-004 | Pagos idempotentes mediante un puerto de pagos | DA04 | Evitar cobros dobles y desacoplarse del proveedor. | Contrato `PasarelaPago` + adaptador + identificador único por pago. |
| ADR-005 | Escalamiento horizontal con caché y cola | DA02 | Soportar de 1,000 a 10,000 usuarios simultáneos. | Autoescalado, Redis, réplicas de lectura y workers. |
| ADR-006 | Reloj de plazos como tarea programada | DA06 | Contar días hábiles y alertar antes del vencimiento. | Proceso diario con calendario de feriados. |
| ADR-007 | Seguridad por capas y bitácora inmutable | DA03, DA05 | Proteger datos personales y dejar trazabilidad. | OTP, roles, TLS 1.3, AES-256, bitácora de solo escritura. |
| ADR-008 | PWA sin conexión para inspectores | DA07 | Registrar la ITSE sin señal. | Almacenamiento local y sincronización posterior. |

---

## ADR-001: Monolito modular
- **Contexto:** la Municipalidad tiene un equipo de TI pequeño y el trámite es transaccional (expediente, pago, inspección y licencia deben ser consistentes).
- **Alternativas:** microservicios; monolito sin módulos.
- **Decisión:** una sola aplicación con módulos de límites claros y una base PostgreSQL.
- **Consecuencias:** ✅ simple de construir, probar y desplegar; ✅ transacciones normales; ✅ se puede extraer un módulo en el futuro. ⚠️ se escala la aplicación completa; ⚠️ la base de datos es el punto más delicado.

## ADR-002: Motor único + catálogo versionado
- **Contexto:** las 9 licencias difieren solo en 6 datos: requisitos, tasa, plazo, calificación, orden del ITSE y vigencia. El TUPA ya cambió una vez (Decreto N.° 009-2024-MPH/A).
- **Alternativas:** programar 9 flujos distintos; un motor de reglas genérico.
- **Decisión:** un motor que sigue la receta del catálogo; cada receta tiene una versión con fecha; cada expediente guarda la versión con la que empezó.
- **Consecuencias:** ✅ un cambio del TUPA no exige programar; ✅ una décima licencia es una receta más. ⚠️ el catálogo necesita un responsable que lo mantenga.

## ADR-003: Clean Architecture
- **Contexto:** las reglas del trámite son lo más valioso y estable; la tecnología (base de datos, pasarela, WhatsApp) puede cambiar.
- **Alternativas:** capas tradicionales donde el negocio depende de la base de datos; MVC.
- **Decisión:** dominio en el centro; los casos de uso usan contratos; la infraestructura implementa esos contratos con adaptadores.
- **Consecuencias:** ✅ las reglas se prueban sin base de datos ni internet; ✅ se cambia de pasarela o de base sin tocar el negocio; ✅ el chatbot (Fase 2) es solo otro adaptador de entrada. ⚠️ más archivos e interfaces.

## ADR-004: Pagos idempotentes mediante un puerto
- **Contexto:** una falla de red puede hacer que la persona reintente el pago.
- **Alternativas:** llamar a la pasarela directamente desde el caso de uso.
- **Decisión:** el caso de uso genera un identificador único y usa el contrato `PasarelaPago`; la confirmación llega por notificación de la pasarela (webhook).
- **Consecuencias:** ✅ ningún cobro doble; ✅ se puede cambiar de pasarela o usar un simulador en pruebas. ⚠️ hay que conciliar los pagos diariamente.

## ADR-005: Escalamiento horizontal con caché y cola
- **Contexto:** campañas de formalización y renovaciones del ITSE generan picos de 1,000 a 10,000 usuarios.
- **Alternativas:** un servidor grande; microservicios.
- **Decisión:** backend sin estado con autoescalado detrás de un balanceador, Redis, réplicas de lectura de PostgreSQL y workers para tareas lentas.
- **Consecuencias:** ✅ crece y se reduce según la demanda; ✅ se paga solo en los picos. ⚠️ infraestructura más compleja de operar.

## ADR-006: Reloj de plazos como tarea programada
- **Contexto:** los plazos del TUPA se cuentan en días hábiles y su vencimiento tiene efectos legales (Ley N.° 27444).
- **Alternativas:** control manual del evaluador.
- **Decisión:** un proceso diario que usa un calendario de feriados y alerta a la jefatura.
- **Consecuencias:** ✅ ningún plazo pasa desapercibido. ⚠️ el calendario de feriados debe mantenerse actualizado.

## ADR-007: Seguridad por capas y bitácora inmutable
- **Contexto:** se manejan datos personales (Ley N.° 29733) y decisiones administrativas auditables.
- **Decisión:** OTP para el personal, roles, TLS 1.3, AES-256 en reposo, QR público con datos mínimos y bitácora de solo escritura.
- **Consecuencias:** ✅ trazabilidad ante reclamos y auditorías. ⚠️ mayor gestión de credenciales y claves.

## ADR-008: PWA sin conexión para inspectores
- **Contexto:** los inspectores trabajan en campo, a veces sin señal.
- **Alternativas:** app nativa Android.
- **Decisión:** aplicación web instalable que guarda la inspección en el celular y sincroniza al recuperar la señal.
- **Consecuencias:** ✅ un solo código para web y celular. ⚠️ hay que resolver la sincronización (cada inspección tiene un solo inspector, lo que reduce conflictos).