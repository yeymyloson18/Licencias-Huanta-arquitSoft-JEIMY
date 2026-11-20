# Investigación (fase 0): Inspección ITSE, licencia con QR, plazos y avisos

Cada decisión indica qué se eligió, por qué y qué se descartó. No queda ninguna "NEEDS
CLARIFICATION" del contexto técnico.

## R-01. El recorrido por ruta se coordina con eventos de la cola de la 005

**Decisión**: cada módulo escribe solo su esquema y se avisan por `comun.evento_pendiente` (el
despachador de la 005). `tramites` es el único que cambia el estado del expediente:

| Evento | Lo publica | Lo consume | Efecto |
| --- | --- | --- | --- |
| `LicenciaSolicitada {numeroExpediente, tipo, certificado?}` | `tramites` al aprobar (A y C) o con PREVIA favorable | `licencias` | Emite la licencia (idempotente: una vigente por expediente) y publica `LicenciaEmitida` |
| `LicenciaEmitida {numeroExpediente, numeroLicencia, tipo}` | `licencias` | `tramites` | A: LICENCIA_EMITIDA → ITSE_POSTERIOR_PENDIENTE + `InspeccionRequerida POSTERIOR`; B: LICENCIA_EMITIDA → FINALIZADO; C: LICENCIA_PROVISIONAL + `InspeccionRequerida BODEGA` |
| `InspeccionRequerida {numeroExpediente, tipo}` | `tramites` (B al registrarse el pago; A y C tras la licencia) | `inspecciones` | Crea la inspección (`INSERT … ON CONFLICT DO NOTHING`, única por expediente y tipo) |
| `ResultadoITSERegistrado {numeroExpediente, inspeccionId, tipo, resultado}` | `inspecciones` | `tramites` | PREVIA: FAVORABLE → `LicenciaSolicitada` con el certificado; DESFAVORABLE → DENEGADO. POSTERIOR: FAVORABLE → FINALIZADO + `CertificadoItseRegistrado`; DESFAVORABLE → DERIVADO_A_FISCALIZACION. BODEGA: FAVORABLE → `CertificadoItseRegistrado` (sin cambio de estado); DESFAVORABLE → DERIVADO_A_FISCALIZACION |
| `CertificadoItseRegistrado {numeroExpediente, numero, emitidoEn}` | `tramites` | `licencias` | Registra el certificado en la licencia vigente (idempotente por número) |
| `EstadoExpedienteCambiado` (ya existe) | `tramites` | `notificaciones` | Aviso al titular |
| `ItsePorVencer {numeroExpediente, venceEn}` | `licencias` (al marcar el aviso) | `notificaciones` | Aviso de vencimiento |

Las observaciones del inspector (texto libre) **no** viajan en los eventos: `tramites` las lee con
`FachadaInspecciones.resultadoDe(inspeccionId)` para el motivo de la denegación (principio VII).

**Por qué**: es el mismo patrón que la esquela y el pago (ADR-005), probado en la 005; cada paso es
idempotente y se reintenta sin límite.

**Descartado**: llamadas directas entre módulos que escriben en otro esquema (rompe el principio III);
un orquestador central (más piezas sin beneficio).

## R-02. El despachador entrega el id del evento al manejador

**Decisión**: `ManejadorEvento = (datos, meta: { id: bigint }) => Promise<void>` (el segundo
parámetro es nuevo y opcional para los manejadores existentes). `notificaciones` lo usa como clave de
idempotencia del aviso (`mensaje.evento_id UNIQUE`).

Los `EstadoExpedienteCambiado` que la 005 dejó pendientes se marcan como procesados en la migración
0010: avisar hoy de cambios de hace días confundiría al titular (análisis H3).

**Por qué**: un mismo estado puede repetirse en la vida del expediente (EN_EVALUACION tras subsanar),
así que el contenido del evento no basta para distinguir un reintento de un cambio nuevo.

## R-03. Calendario hábil: función pura con los feriados como dato

**Decisión**: `CalendarioHabil` en `plazos/dominio` recibe el conjunto de feriados y ofrece
`sumarDiasHabiles(desde, n)` (empieza a contar el día hábil siguiente) y
`diasHabilesRestantes(hoy, vence)` (negativo si ya venció; 0 el mismo día). Las fechas se manejan
como `AAAA-MM-DD` en hora de Lima, sin horas. El adaptador lee los feriados de un rango de años (la
tabla es pequeña) en cada cálculo.

`FachadaPlazos` expone `sumarDiasHabiles` y `diasHabilesRestantes` para `tramites` (vencimiento,
plazo para subsanar y reanudación).

**Descartado**: librerías de días hábiles (dependencia para 40 líneas de lógica); guardar días
hábiles precalculados (se desactualiza al registrar un feriado).

## R-04. Suspensión del plazo con los días restantes guardados

**Decisión**: columna nueva `tramites.expediente.plazo_restante_dias smallint` (migración 0010). Al
pasar a OBSERVADO o PENDIENTE_PAGO se guardan los días hábiles que quedaban y `vence_plazo_en` queda
NULL; al subsanar o registrarse el pago, `vence_plazo_en = sumarDiasHabiles(hoy, restantes)` y la
columna vuelve a NULL. Un plazo ya vencido al suspender guarda 0 (se reanuda venciendo hoy).

**Por qué**: el reloj solo mira `vence_plazo_en`; un expediente suspendido no genera alertas sin
reglas extra.

## R-05. Plazo para subsanar: 2 días hábiles

**Decisión**: `ObservarExpediente` calcula `plazo_subsanar_en = sumarDiasHabiles(hoy, 2)` (TUO de la
Ley N.° 27444, numeral 136.2; docs/01 no fija otro). El campo `plazoSubsanarEn` del cuerpo de
`/observar` deja de usarse (el contrato lo marca como ignorado; no se quita para no romper clientes).

## R-06. Vencimiento al presentar y expedientes antiguos

**Decisión**: `PresentarSolicitud` (004) calcula `vence_plazo_en` con `plazoDias` de la receta guardada
(sin vencimiento si es NULL o 0) mediante un puerto `PlazosHabiles` (adaptador sobre `FachadaPlazos`).
Los expedientes existentes sin vencimiento se completan **una vez** al arrancar la API: una rutina
idempotente que solo toca filas en estados con plazo, con `vence_plazo_en` y `plazo_restante_dias`
NULL, calculando desde su fecha de presentación (las suspendidas guardan sus días restantes).

**Descartado**: calcularlo en SQL dentro de la migración (duplicaría la regla de días hábiles).

## R-07. Reloj de plazos con candado de una sola ejecución (ADR-006)

**Decisión**: `RelojPlazos` en `plazos/infraestructura` corre al iniciar y cada
`RELOJ_PLAZOS_INTERVALO_MS` (por defecto 3 600 000; 0 en pruebas, que lo invocan a mano). Cada pasada
abre una transacción y pide `pg_try_advisory_xact_lock(4006001)`; si otra réplica lo tiene, no hace
nada. Con el candado:

1. Lee de `FachadaTramites.expedientesConPlazo()` los expedientes en REGISTRADO, EN_EVALUACION,
   PAGADO, EN_INSPECCION o APROBADO con vencimiento, calcula los días hábiles restantes y, si son 2 o
   menos, inserta la alerta con `ON CONFLICT (numero_expediente, vence_en) DO NOTHING`.
2. Pide a `FachadaLicencias.avisarCertificadosPorVencer(hoy + 30 días)` que marque los certificados
   (`UPDATE … SET aviso_enviado_en = now() WHERE aviso_enviado_en IS NULL AND vence_en <= …`) y
   publique `ItsePorVencer` en la misma transacción de `licencias`.

**Por qué**: el UNIQUE garantiza "ni cero ni duplicadas" aunque falle el candado; el candado evita
trabajo doble (EQ-07). El paso 2 es atómico por certificado.

## R-08. Alertas para la jefatura

**Decisión**: `GET /plazos/alertas?pendientes=true` ordena por `vence_en` ascendente y luego por días
restantes (las vencidas primero); los días restantes se recalculan al leer (el valor guardado es el
de la generación). `POST /plazos/alertas/{id}/atender` (nuevo) marca `atendida_en` y `atendida_por`
(columna nueva en 0010). El estado del expediente llega por `FachadaTramites`.

## R-09. QR con `qrcode-generator` dibujado en el PDF

**Decisión**: única dependencia nueva de ejecución: `qrcode-generator` (MIT, sin dependencias,
~50 kB, años de uso en navegadores y Node). Da la matriz de módulos y `pdf-lib` (ya instalado) dibuja
cada módulo como un cuadrado: el QR es vectorial y nítido al imprimir. Corrección de errores nivel M.
La URL del QR es `${URL_PUBLICA_PORTAL}/verificar/<código>` (variable nueva, por defecto
`http://localhost:8080`).

**Descartado**: `qrcode` (trae `pngjs`, `dijkstrajs` y `yargs`); generar un PNG y luego incrustarlo
(más pasos y pérdida de nitidez).

## R-10. Número y código de verificación de la licencia

**Decisión**: número `LF-AAAA-NNNNNN` con la secuencia `licencias.numero_licencia_seq` (ya existe) y
el año de emisión en hora de Lima. Código: 16 bytes de `crypto.randomBytes` en base64url = 22
caracteres (128 bits, no adivinable), que cumple el patrón del contrato `^[A-Za-z0-9_-]{22}$`.

## R-11. Titular público

**Decisión**: razón social si existe; si no, el primer nombre completo y cada palabra siguiente
abreviada a su inicial con punto ("Juana Pérez Quispe" → "Juana P. Q."). Se calcula en `licencias`
con los datos que da `FachadaTramites.datosParaLicencia(numero)` (giro, zona, nombre comercial, razón
social, nombre del titular, ruta y vigencia en meses de la receta guardada); nunca recibe el documento.

## R-12. Verificación pública con límite de intentos fallidos

**Decisión**: `GET /licencias/verificar/{codigo}` sin sesión. Un código mal formado o inexistente
responde el mismo 404. Cada 404 suma en Redis (`lim:verificacion:<origen>`, ventana de 15 minutos); con
10, responde 429 con `Retry-After` incluso para códigos válidos. Las verificaciones exitosas no
cuentan (un local puede ser verificado muchas veces). Si Redis no responde, 503 (falla cerrado, como
la consulta de la 004). El estado VENCIDA se calcula al leer (`vigente_hasta < hoy`).

## R-13. Fotos de la inspección

**Decisión**: `multipart/form-data` con `fotos` (1 a 5, como pide la entrada; el contrato decía 10 y se
ajusta), cada una de hasta 10 MB y JPG o PNG comprobado por el contenido. La detección de tipo
(`tipo-archivo.ts`) y el almacén en disco (`AlmacenArchivosDisco`) pasan de `tramites` a
`compartido` para que `inspecciones` los use sin importar otro módulo; las claves son UUID
aleatorios como en la 004 (el almacén solo acepta UUID: nadie puede salir de la carpeta). Las fotos se guardan antes de la transacción y, si la transacción falla, se borran.

## R-14. Dirección del local para el inspector

**Decisión**: la bandeja del inspector muestra la dirección del local de **sus** inspecciones (la
necesita para ir), como ya declara el contrato ("Visible para el inspector asignado"). La jefatura ve
la dirección en el detalle del expediente (004), no en la bandeja de inspecciones. `inspecciones` la
pide a `FachadaTramites.direccionDelLocal(numero)` solo para el inspector asignado; nunca se guarda en
`inspecciones` ni va en eventos, registros o auditoría.

## R-15. Lista de inspectores para asignar

**Decisión**: `GET /inspecciones/inspectores` (nuevo, rol JEFATURA) devuelve `{id, nombre}` de los
usuarios activos con rol INSPECTOR, mediante `FachadaSeguridad.usuariosConRol('INSPECTOR')`. Al
asignar se vuelve a comprobar que el usuario está activo y tiene el rol.

## R-16. Avisos al titular

**Decisión**:

- `notificaciones` consume `EstadoExpedienteCambiado` e `ItsePorVencer`; pide a
  `FachadaTramites.contactoTitular(numero)` el correo (si lo dio) o el celular, y lo guarda cifrado con
  el `ProtectorDatos` en `destino_cifrado`. Canal CORREO si hay correo; si no, SMS.
- Plantillas (`CAMBIO_ESTADO`, `ITSE_POR_VENCER`) con solo el número de expediente, el estado en
  lenguaje sencillo y qué sigue (los textos de la consulta pública).
- `EnviadorAvisos` (tarea periódica, `AVISOS_INTERVALO_MS`, por defecto 5 000; 0 en pruebas) toma
  los PENDIENTE con `FOR UPDATE SKIP LOCKED`, envía por el puerto `EnviadorMensajes` y reintenta con
  espera creciente (`reintentar_en`, columna nueva) hasta 5 intentos; luego FALLIDO.
- Adaptador simulado (desarrollo): deja el texto en Redis `dev:aviso:<id>` con caducidad de 1 hora,
  como el código de la 004. Sin el destinatario en claro.

## R-17. Feriados nacionales de 2026

**Decisión**: semilla en la migración 0010 (registrados por un usuario de sistema
`00000000-0000-0000-0000-000000000000`), según el D. Leg. N.° 713 y sus modificatorias, que la prensa
nacional confirma como 16 feriados para 2026:

| Fecha | Feriado |
| --- | --- |
| 2026-01-01 | Año Nuevo |
| 2026-04-02 | Jueves Santo |
| 2026-04-03 | Viernes Santo |
| 2026-05-01 | Día del Trabajo |
| 2026-06-07 | Batalla de Arica y Día de la Bandera |
| 2026-06-29 | San Pedro y San Pablo |
| 2026-07-23 | Día de la Fuerza Aérea del Perú |
| 2026-07-28 | Fiestas Patrias |
| 2026-07-29 | Fiestas Patrias |
| 2026-08-06 | Batalla de Junín |
| 2026-08-30 | Santa Rosa de Lima |
| 2026-10-08 | Combate de Angamos |
| 2026-11-01 | Todos los Santos |
| 2026-12-08 | Inmaculada Concepción |
| 2026-12-09 | Batalla de Ayacucho |
| 2026-12-25 | Navidad |

Fuentes consultadas el 20/11/2026: notas de El Comercio, La República y Canal N sobre los 16
feriados de 2026. **Pendiente**: confirmarlos con el texto publicado en El Peruano antes del
despliegue; el administrador puede corregirlos desde `/admin/feriados`.

## R-18. Permiso para el PDF de la licencia

**Decisión**: el `tokenConsulta` de la 005 se emite también cuando el expediente tiene licencia
(LICENCIA_EMITIDA, LICENCIA_PROVISIONAL, ITSE_POSTERIOR_PENDIENTE, FINALIZADO,
DERIVADO_A_FISCALIZACION). `GET /licencias/{numero}` y `/pdf` usan el `ConsultaOPersonalGuard` (roles
EVALUADOR y JEFATURA; con token, solo la licencia de ese expediente). La consulta pública trae
`numeroLicencia`.

## R-19. Ruta B al registrarse el pago

**Decisión**: `AplicarPagoRegistrado` (005), en la misma transacción, pasa a PAGADO y, si la ruta es B,
a EN_INSPECCION (dos registros de historial) y publica `InspeccionRequerida PREVIA`; también reanuda el
plazo (R-04).
