# Análisis de la base de datos (Sprint 2)

PostgreSQL 16, **una base con un esquema por módulo**. Cada módulo solo lee y escribe su esquema
(constitución, principio III). Para los datos de otro módulo usa su fachada o un evento.

## 1. Esquemas por módulo y por qué

| Esquema | Módulo | Qué guarda | Por qué separado |
| --- | --- | --- | --- |
| `comun` | compartido | `evento_pendiente` (cola de eventos entre módulos) | Es el único punto de encuentro entre módulos, y es asíncrono |
| `seguridad` | Seguridad y usuarios | usuarios, roles, sesiones, códigos OTP, verificaciones de identidad | Datos sensibles con su propio control de acceso |
| `catalogo` | Catálogo y asistente | recetas del TUPA, requisitos, preguntas y reglas, historial de cambios | Cambia por decisión municipal, no por trámite (ADR-002) |
| `tramites` | Trámites | expedientes, documentos, historial de estados, observaciones, auditoría | Es el núcleo del proceso, con los datos personales cifrados |
| `pagos` | Pagos en caja | esquelas, recibos, auditoría | Dinero: transacciones y auditoría propias (ADR-004) |
| `inspecciones` | Inspecciones ITSE | inspecciones, fotos, auditoría | Trabajo de campo del inspector |
| `licencias` | Licencias | licencias, certificados ITSE, auditoría | Documento con efecto legal y verificación pública |
| `plazos` | Reloj de plazos | feriados y alertas | Reglas de calendario independientes del trámite |
| `notificaciones` | Notificaciones | avisos (destino cifrado) | Envío con reintentos, sin tocar el expediente |

`reportes` no tiene esquema: calcula sobre lo que le entregan las fachadas y guarda el resultado 5
minutos en Redis (ver [cache.md](cache.md)).

Ventajas:

- un módulo puede cambiar sus tablas sin romper a otro;
- separarlo en un servicio propio más adelante es mover un esquema.

El costo: los informes que cruzan módulos (el tablero) se arman por fachadas y no con un `JOIN`.

## 2. Índices y la consulta a la que sirve cada uno

Están en `docs/05-modelo-de-datos/esquema.sql` y en las migraciones `apps/api/prisma/migrations/`.

| Índice | Tabla | Consulta a la que sirve |
| --- | --- | --- |
| `ix_expediente_consulta` (`numero`, `documento_hmac`) | `tramites.expediente` | Consulta pública del estado con número y DNI (RF03). El DNI nunca se guarda en claro: se compara su HMAC |
| `ix_expediente_ruc` (`ruc_hmac`) | `tramites.expediente` | La misma consulta con RUC |
| `ix_expediente_estado` (`estado`, `vence_plazo_en`) | `tramites.expediente` | Bandeja filtrada por estado y reloj de plazos (vencimientos) |
| `ix_expediente_bandeja` (`evaluador_id`, `estado`) | `tramites.expediente` | Bandeja del evaluador |
| `ix_expediente_presentado` (`presentado_en`) | `tramites.expediente` | Tablero: presentados en un rango (007) y orden de la bandeja |
| `ux_expediente_verificacion` (`verificacion_id`) | `tramites.expediente` | Una verificación de identidad sirve para un solo expediente (004) |
| `ix_historial_expediente` (`expediente_id`, `ocurrido_en`) | `tramites.historial_estado` | Línea de tiempo del expediente y suspensiones del plazo |
| `ix_historial_decision` (`ocurrido_en`) parcial | `tramites.historial_estado` | Tablero: decisiones finales en un rango (007) |
| `ix_documento_expediente`, `ix_documento_temporal_subido_en` | `tramites.documento*` | Documentos de un expediente y descarte de los temporales vencidos |
| `ix_auditoria_tramites` (`numero_expediente`, `ocurrido_en`) | `tramites.auditoria` | Auditoría de un expediente |
| `ux_esquela_recibo` (`numero_recibo`) parcial | `pagos.esquela` | Un recibo no se registra dos veces (RF12) |
| `ix_esquela_pagada_en` (`pagada_en`) parcial | `pagos.esquela` | Auditoría de pagos e ingresos del tablero en un rango |
| `ix_inspeccion_bandeja` (`inspector_id`, `estado`) | `inspecciones.inspeccion` | Bandeja del inspector |
| `ux_licencia_vigente_por_expediente` parcial | `licencias.licencia` | Una sola licencia vigente por expediente |
| `ix_licencia_situacion` (`estado`, `codigo_receta`) | `licencias.licencia` | Reporte de licencias vigentes por tipo (007) |
| `ix_itse_por_vencer` (`vence_en`) parcial y `ix_certificado_vence` (`vence_en`) | `licencias.certificado_itse` | Aviso del ITSE por vencer (006) y reporte "ITSE por vencer" (007) |
| `ix_evento_pendiente_sin_procesar` (`creado_en`) parcial | `comun.evento_pendiente` | La cola solo recorre los eventos sin procesar |
| `ix_mensaje_pendiente` (`creado_en`) parcial | `notificaciones.mensaje` | Avisos por enviar |
| `ix_codigo_otp_vigente`, `ix_sesion_usuario_vigente`, `ux_usuario_rol_vigente`, `ix_usuario_rol_admin_vigente` | `seguridad.*` | Ingreso con OTP, sesiones vigentes, roles vigentes y la regla del último administrador |

Los índices **parciales** (`WHERE procesado_en IS NULL`, `WHERE pagada_en IS NOT NULL`, etc.) indexan
solo las filas que se buscan. La cola de eventos puede tener cientos de miles de eventos procesados y
su índice sigue pequeño.

## 3. Planes de las consultas críticas con 10,000 expedientes

Los produce el job `planes-bd` del flujo
[`carga-sprint2.yml`](../../.github/workflows/carga-sprint2.yml). El flujo levanta un PostgreSQL
efímero, aplica las migraciones y siembra
[`tests/analisis/sembrar-10000.sql`](../../tests/analisis/sembrar-10000.sql):

- 10,000 expedientes ficticios con su historial;
- 6,000 esquelas (4,000 pagadas);
- 10,000 eventos (2,000 pendientes).

Después actualiza las estadísticas y ejecuta
[`tests/analisis/planes-consultas.sql`](../../tests/analisis/planes-consultas.sql) con
`EXPLAIN (ANALYZE, BUFFERS)`. Cada consulta es la misma del código: el archivo se cita en el script.

Resultado de la corrida 45106710381 (job `planes-bd`). Salida completa en
[`evidencias/planes-consultas-10000.txt`](evidencias/planes-consultas-10000.txt).

| N.° | Consulta | Archivo del código | Plan esperado | Tiempo medido |
| --- | --- | --- | --- | --- |
| 1a | Página de la bandeja por estado, de la más nueva a la más antigua | `tramites/infraestructura/repositorio-expedientes-postgres.ts` (`listar`) | `Index Scan` de `ix_expediente_estado` (o `Bitmap`) y `Sort` de unas cientos de filas con `LIMIT 20` | **0.24 ms**: `Index Scan Backward` de `ix_expediente_presentado` + `Incremental Sort`, 296 bloques en caché |
| 1b | Total de la bandeja por estado | mismo | `Index Only Scan` o `Bitmap` sobre `ix_expediente_estado` | **0.32 ms**: `Bitmap Index Scan` de `ix_expediente_estado` (800 filas) |
| 2 | Consulta pública por número + HMAC | `repositorio-expedientes-postgres.ts` (`buscarParaConsulta`) | `Index Scan` por la clave única de `numero` (o `ix_expediente_consulta`); 1 fila, menos de 1 ms | **0.05 ms**: `Index Scan` de `ix_expediente_consulta`, 1 fila |
| 3a | Presentados en el mes, por estado | `tramites/infraestructura/lector-para-reportes-postgres.ts` (`conteoPorEstado`) | `Bitmap/Index Scan` de `ix_expediente_presentado` + `HashAggregate` | **0.23 ms**: `Bitmap Index Scan` de `ix_expediente_presentado` (620 filas) |
| 3b | Primera decisión final en el mes | `lector-para-reportes-postgres.ts` (`terminados`) | `Index Scan` de `ix_historial_decision` para el rango y `ix_historial_expediente` para el `MIN` | **2.06 ms**: `Bitmap Index Scan` de `ix_historial_decision` (6,800 y 415 filas) + `Index Scan` de la clave primaria |
| 3c | Pagos del mes | `pagos/infraestructura/repositorio-esquelas-postgres.ts` (`pagadasEntre`) | `Index Scan` de `ix_esquela_pagada_en` | **0.10 ms**: `Bitmap Index Scan` de `ix_esquela_pagada_en` (245 filas) |
| 4 | Esquela por código en caja | `repositorio-esquelas-postgres.ts` (`obtener`) | `Index Scan` por la clave primaria `codigo`; 1 fila | **0.02 ms**: `Index Scan` de `esquela_pkey`, 1 fila |
| 5 | Toma de eventos con `FOR UPDATE SKIP LOCKED` | `compartido/infraestructura/despachador-eventos.ts` | `LockRows` sobre `Index Scan` (clave primaria por `id` o `ix_evento_pendiente_sin_procesar`) con `LIMIT 50` | **0.07 ms**: `LockRows` sobre `Index Scan` de la clave primaria, 50 filas |
| 6 | Reloj de plazos: plazo corriendo | `tramites/infraestructura/repositorio-vencimientos-postgres.ts` (`conPlazo`) | `Bitmap Index Scan` de `ix_expediente_estado` con varios estados | **0.84 ms**: `Bitmap Index Scan` de `ix_expediente_estado` (2,200 filas) |

**Lectura de los planes**:

- Las 9 consultas críticas usan un índice y **ninguna recorre la tabla completa** (`Seq Scan`); la más
  lenta, el tablero (3b), tarda 2 ms con 10,000 expedientes.
- La caché de PostgreSQL atendió el **99.88 %** de las lecturas (499,694 bloques en memoria y 623 desde
  disco).
- En la bandeja (1a) el planificador prefirió `ix_expediente_presentado` y filtrar el estado (descartó
  271 filas) en lugar de `ix_expediente_bandeja`: con 10,000 expedientes es más barato. Si la bandeja
  crece a cientos de miles, conviene revisar ese plan.
- Los contadores de uso de índices (`pg_stat_user_indexes`) al final del archivo salen en 0 para varios
  índices que sí se usaron: PostgreSQL los actualiza con retraso, así que el plan es la evidencia válida.
- Durante la carga de 2,000 usuarios PostgreSQL tuvo **2 conexiones activas como máximo** y 99.93 % de
  aciertos de caché: Redis absorbió casi todas las lecturas del catálogo (ver
  [cache.md](cache.md)).

## 4. Transacciones y bloqueos

| Mecanismo | Dónde (archivo) | Problema que evita |
| --- | --- | --- |
| **Transacción con varias escrituras**: decisión del evaluador + historial + auditoría + evento | `tramites/infraestructura/repositorio-decisiones-postgres.ts`, `unidad-de-trabajo-tramites-postgres.ts` | Que quede un cambio de estado sin su historial, su auditoría o su evento. Todo se confirma o nada (patrón unidad de trabajo y bandeja de salida) |
| **Bloqueo optimista con `version`** (cabecera `If-Match`, `UPDATE … WHERE version = $leida`) | `repositorio-decisiones-postgres.ts` | Que dos evaluadores pisen la decisión del otro: el segundo recibe 412 |
| **Actualización condicional del pago** (`UPDATE … WHERE numero_recibo IS NULL`) e índice único del recibo | `pagos/infraestructura/repositorio-esquelas-postgres.ts` (`registrarPago`) | Cobrar dos veces la misma esquela: con 10 pagos simultáneos, solo uno gana (prueba de la 005) |
| **`SELECT … FOR UPDATE`** de la fila | `tramites/infraestructura/unidad-de-trabajo-tramites-postgres.ts`, `repositorio-subsanacion-postgres.ts`, `catalogo/infraestructura/unidad-de-trabajo-catalogo-postgres.ts` | Que dos transacciones lean el mismo estado y decidan las dos (presentación idempotente, subsanación, edición de recetas) |
| **`FOR UPDATE SKIP LOCKED`** | `compartido/infraestructura/despachador-eventos.ts`, `notificaciones/infraestructura/repositorio-avisos-postgres.ts` | Que dos réplicas procesen el mismo evento o envíen el mismo aviso: cada una toma filas distintas sin esperar |
| **`pg_try_advisory_xact_lock`** (candado consultivo que no espera) | `despachador-eventos.ts`, `plazos/infraestructura/reloj-plazos.ts`, `tramites/infraestructura/tarea-descarte-documentos.ts` | Que el reloj de plazos o la limpieza corran dos veces a la vez con 2 réplicas: la que no obtiene el candado se salta la pasada (ADR-006, probado con 2 aplicaciones en la 006) |
| **`pg_advisory_xact_lock`** (candado consultivo que espera) | `seguridad/infraestructura/repositorio-usuarios-postgres.ts` | Que dos administradores se quiten el rol a la vez y el sistema quede sin ninguno (regla del último administrador) |
| **Restricciones `UNIQUE` y `ON CONFLICT DO NOTHING`** | evento por aviso (`evento_id`), alerta por expediente y vencimiento, licencia vigente por expediente | Que un evento entregado dos veces cree dos avisos, dos alertas o dos licencias (idempotencia) |

Se usan candados **de transacción** (`_xact_`): se sueltan solos al terminar, aunque la réplica se caiga.
Así son compatibles con PgBouncer en modo transacción en producción (ADR-008).

## 5. Conexiones

- **Desarrollo y la prueba de carga**: cada réplica de la API abre su propio pool de Prisma. El tamaño
  por defecto es procesadores × 2 + 1. Con 2 réplicas en el ejecutor de GitHub (4 procesadores) son
  hasta 18 conexiones.
- **Producción**: las réplicas pasan por PgBouncer en modo transacción, con `connection_limit=10` por
  réplica hacia PgBouncer y un tope de 20 conexiones hacia PostgreSQL. Las conexiones no crecen al
  agregar réplicas (`infra/produccion/docker-compose.yml`, ADR-008).

### Lo observado durante la carga de 2,000 usuarios

Durante la carga, el job `carga` toma cada 10 s:

- las conexiones de `pg_stat_activity` por estado (`active` e `idle`);
- los aciertos de la caché de PostgreSQL (`blks_hit` frente a `blks_read`).

Todo queda en el artefacto `carga-sprint2` (`recursos.jsonl`).

Resultado de la corrida 45106710381, durante la carga progresiva hasta 2,000 usuarios:

| Medida | Resultado |
| --- | --- |
| Conexiones activas (máximo) | **2** (cada réplica tiene su propio pool; casi todas las lecturas las atendió Redis) |
| Conexiones totales (máximo) | No se resumió en esta corrida; queda en `recursos.jsonl` del artefacto |
| Aciertos de la caché de PostgreSQL | **99.93 %** durante la carga (99.88 % en el job `planes-bd` con 10,000 expedientes) |
