Funcionalidad 005: Evaluación del expediente, esquela de pago y pago en caja.

Une dos funcionalidades del plan original (005 esquela y pago, 006 evaluación) para cumplir la entrega en 5 días. Cubre HU07, HU04, HU13 y HU17; RF09, RF11, RF12, RF24 y RF25 (para pagos y decisiones del evaluador); casos de uso CU13, CU14, CU16 y CU21; ADR-004 (una esquela por expediente), ADR-005 (outbox) y ADR-007. Issues de GitHub: #7 (HU04), #16 (HU13), #20 (HU17) y la HU07 del milestone 006. Usa los expedientes de la 004, el catálogo de la 003 y la seguridad de la 002. El contrato ya declara las operaciones: /expedientes/{numero}/riesgo, /aprobar, /observar, /denegar, /subsanar y /auditoria; /esquelas/{codigo}, /pdf, /pago y /recibo; y /pagos/auditoria.

## Qué debe hacer el sistema (especificación)

Como evaluador quiero revisar el expediente, confirmar o corregir el nivel de riesgo y luego aprobarlo, observarlo o denegarlo, para que el trámite avance según el TUPA.

Como administrado quiero obtener una esquela de pago con el monto y el código de mi expediente, para pagar en la caja de la Municipalidad.

Como personal de caja quiero registrar el pago con el código de la esquela, viendo antes el expediente, el titular y el monto, para no registrar la esquela equivocada.

Como jefatura quiero corregir un número de recibo mal digitado indicando el motivo y ver quién registró cada pago o decisión.

1. El evaluador (rol EVALUADOR) abre un expediente REGISTRADO desde la bandeja de la 004 y lo pasa a EN_EVALUACION al empezar la revisión.
2. Confirmar el riesgo: el evaluador confirma el nivel de riesgo de la licencia presentada o lo corrige a otra licencia del mismo grupo (por ejemplo, de riesgo medio a riesgo alto). Si lo corrige, el expediente toma la ruta y la tasa de la nueva receta vigente. En el mismo paso, y en la misma transacción, se genera **una sola** esquela con el código ESQ-<número de expediente>, el concepto, el monto copiado de la receta y la fecha; el expediente pasa a PENDIENTE_PAGO. Confirmar dos veces no crea dos esquelas (la base de datos lo impide: una esquela por expediente).
3. Observar: el evaluador indica qué falta con un texto; el expediente pasa a OBSERVADO. El administrado o mesa de partes subsana subiendo los documentos que faltaban (con el permiso de identidad de la 004 o la sesión de MESA_PARTES) y vuelve a EN_EVALUACION. Se permite una sola observación por expediente (TUPA).
4. Denegar: el evaluador indica el motivo; el expediente pasa a DENEGADO y no puede avanzar más.
5. Aprobar: en esta funcionalidad, aprobar solo se permite cuando el expediente ya está PAGADO (ruta A); deja el expediente APROBADO. La emisión de la licencia con QR y la ruta B con ITSE previa son de la funcionalidad siguiente (006).
6. Esquela: el administrado la ve y descarga en PDF desde la consulta pública de la 004 (cuando su expediente está PENDIENTE_PAGO), y el personal desde el detalle. El PDF muestra el número de expediente, el concepto, el monto, el código y cómo pagar en caja; no muestra el documento del titular ni su dirección.
7. Caja (rol CAJA): busca la esquela por su código; antes de guardar ve el expediente, el nombre del titular, la licencia y el monto, y confirma. Ingresa el número de recibo. Registrar el pago es atómico: guarda el recibo, la fecha y el cajero, la auditoría REGISTRAR_PAGO y el evento PagoRegistrado en el outbox. Un segundo registro de la misma esquela responde 409 "esta esquela ya fue pagada" (protegido por una actualización condicional en la base de datos, no solo por una consulta previa). Un número de recibo repetido responde 409.
8. Al registrar el pago, el expediente pasa a PAGADO procesando el evento del outbox (comun.evento_pendiente) en segundo plano, sin que pagos escriba en el esquema de tramites. Si el procesamiento falla, se reintenta y el evento no se pierde.
9. Corregir recibo (rol JEFATURA): cambia el número de recibo de una esquela pagada indicando el motivo (obligatorio); queda en la auditoría CORREGIR_RECIBO con el recibo anterior y el nuevo. No se anulan pagos (fuera de alcance).
10. Auditoría (rol JEFATURA): consulta de la auditoría de pagos (/pagos/auditoria, filtrable por fecha) y de las decisiones de un expediente (/expedientes/{numero}/auditoria): usuario, acción, fecha y hora. Nunca muestra datos personales del titular.
11. Permisos: solo EVALUADOR decide; solo CAJA registra pagos; solo JEFATURA corrige recibos y ve la auditoría. Los demás reciben 403; sin sesión, 401.
12. Cada cambio de estado deja su registro en el historial y su evento en el outbox (las notificaciones se envían en la 006).
13. Las transiciones de estado inválidas (por ejemplo, aprobar un expediente REGISTRADO o pagar una esquela de un expediente DENEGADO) responden 409 con un mensaje claro.

Fuera de alcance: emisión de la licencia con QR, ruta B e ITSE (006); notificaciones por correo/SMS (006); vencimiento de plazos en días hábiles (006); anulación de pagos; pagos digitales.

## Cómo construirlo (guía para el plan)

- Módulos: tramites (decisiones del evaluador, máquina de estados del expediente, subsanación, consumidor del evento PagoRegistrado) y pagos (esquela, PDF, registro y corrección del pago, auditoría de pagos). Pagos recibe del expediente solo lo necesario por la fachada de tramites (número, receta, monto, nombre del titular descifrado solo para la pantalla de caja); tramites pide la generación de la esquela por la fachada de pagos dentro de la misma transacción, o con el evento EsquelaSolicitada si la transacción compartida rompe la regla de un esquema por módulo (decidir en el plan, a favor de la constitución).
- Dominio puro: máquina de estados del expediente (transiciones permitidas por ruta), regla de una sola observación, Esquela (código ESQ-<expediente>, monto > 0, se paga una sola vez, el recibo se corrige solo si está pagada y con motivo).
- Migración 0008 solo si hace falta (por ejemplo, acciones nuevas en tramites.auditoria u observación); docs/05 en el mismo commit; no editar 0001 a 0007.
- Contrato primero: revisar las operaciones ya declaradas en openapi.yaml y ajustar solo lo necesario.
- Consumidor del outbox: un procesador periódico con pg_try_advisory_lock y FOR UPDATE SKIP LOCKED, idempotente (procesar dos veces el mismo evento no cambia nada), con reintentos.
- PDF de la esquela: generado en la API con una librería ya instalada si existe; si no, una sola dependencia ligera y conocida (justificarla en research.md).
- Portal: en el detalle del expediente del personal, botones según el rol y el estado (Confirmar riesgo, Observar, Denegar, Aprobar); pantalla /personal/caja para registrar el pago con confirmación; pantalla /personal/auditoria para jefatura con corrección de recibo; en la consulta pública, el enlace "Descargar esquela" cuando está PENDIENTE_PAGO.
- Pruebas: unitarias de la máquina de estados y de la esquela; integración del flujo completo (registrado → evaluación → riesgo → esquela → pago → PAGADO → aprobado), doble confirmación (una esquela), doble pago y 10 pagos en paralelo de la misma esquela (un solo pago), recibo repetido, corrección con y sin motivo, matriz 401/403 de todos los endpoints nuevos, privacidad (sin datos personales en registros, auditoría ni PDF), reintento del outbox.
- Para ganar tiempo: sin k6, Lighthouse ni ZAP en esta funcionalidad; se hacen una sola vez en el despliegue (007). Cobertura ≥ 80 % y los 5 checks de CI siguen siendo obligatorios.
- Al terminar: README (funcionalidad 005), diagrama de casos de uso (CU13, CU14, CU16 y CU21 a Hecho).
