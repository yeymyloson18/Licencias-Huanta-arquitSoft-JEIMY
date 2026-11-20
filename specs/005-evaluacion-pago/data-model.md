# Modelo de datos: Evaluación del expediente, esquela de pago y pago en caja

La mayoría de las tablas ya existen en `docs/05-modelo-de-datos/esquema.sql`. La migración
`0008_evaluacion_pago` hace solo tres cambios; las migraciones 0001 a 0007 no se editan.

## Migración 0008

```sql
-- 1. Acciones nuevas de la auditoría de trámites.
ALTER TABLE tramites.auditoria DROP CONSTRAINT auditoria_accion_check;
ALTER TABLE tramites.auditoria ADD CONSTRAINT auditoria_accion_check CHECK (accion IN
    ('CONFIRMAR_RIESGO', 'CORREGIR_RIESGO', 'APROBAR', 'OBSERVAR', 'DENEGAR', 'REGISTRAR_PRESENCIAL',
     'PRESENTAR_EN_LINEA', 'VER_DETALLE', 'INICIAR_EVALUACION', 'SUBSANAR'));

-- 2. El plazo para subsanar se calcula en la 006 (días hábiles).
ALTER TABLE tramites.observacion ALTER COLUMN plazo_subsanar_en DROP NOT NULL;

-- 3. Espera entre reintentos del despachador de eventos (research §R-02).
ALTER TABLE comun.evento_pendiente ADD COLUMN reintentar_en timestamptz;
CREATE INDEX ix_evento_pendiente_por_procesar ON comun.evento_pendiente (id)
    WHERE procesado_en IS NULL;
```

El nombre real de la restricción del CHECK se comprueba contra la base migrada antes de escribir la
migración (la prueba `esquema-equivalente` de la 004 compara `esquema.sql` con las migraciones).

## 1. `tramites.expediente` (de la 004)

| Columna                   | Uso en la 005                                                         |
| ------------------------- | --------------------------------------------------------------------- |
| `estado`                  | Avanza según la máquina de estados (research §R-03).                  |
| `codigo_receta`, `ruta`   | Cambian si el evaluador corrige el riesgo (FR-004).                   |
| `nivel_riesgo_propuesto`  | Nivel de la licencia presentada; se llena al confirmar.               |
| `nivel_riesgo_confirmado` | Nivel de la licencia confirmada.                                      |
| `evaluador_id`            | Quién empezó la revisión (FR-002).                                    |
| `version`                 | Bloqueo optimista: `If-Match` en cada decisión (research §R-05).      |
| `actualizado_en`          | Se actualiza en cada cambio.                                          |
| `receta_al_presentar`     | No cambia: es la copia de lo presentado (y la base de la subsanación). |

Validaciones del dominio: transiciones de la tabla de research §R-03; la licencia corregida es
LICENCIA, vigente y del mismo grupo; observar y denegar exigen un texto de 10 a 1,000 caracteres.

## 2. `tramites.observacion`

Una fila por expediente como máximo (regla del dominio, comprobada en la transacción).
`descripcion` (10 a 1,000 caracteres), `creada_por` (evaluador), `plazo_subsanar_en` (NULL en la
005), `subsanada_en` (se llena al subsanar).

## 3. `tramites.documento` (de la 004)

La subsanación agrega filas con el mismo formato que al presentar; `requisito_orden` sale de
`receta_al_presentar`.

## 4. `tramites.historial_estado` y `tramites.auditoria`

Cada decisión: una fila de historial (estado anterior, nuevo, usuario, comentario) y una de auditoría
(`INICIAR_EVALUACION`, `CONFIRMAR_RIESGO` o `CORREGIR_RIESGO`, `OBSERVAR`, `DENEGAR`, `APROBAR`,
`SUBSANAR`), en la misma transacción que el cambio. `detalle` de la auditoría: solo datos no
personales (`{ codigoRecetaAnterior, codigoRecetaNueva }`, `{ motivo }` de la denegación, `{ canal }`
de la subsanación). El paso a PAGADO por el despachador deja historial con `usuario_id = NULL` (el
sistema) y el comentario "Pago registrado en caja".

## 5. `pagos.esquela` (ya existe)

| Campo                         | Regla                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| `codigo`                      | `ESQ-<número de expediente>` (por ejemplo `ESQ-EXP-2026-000001`).      |
| `numero_expediente`           | Único: una esquela por expediente (ADR-004).                           |
| `codigo_receta`, `concepto`   | Licencia confirmada y su nombre.                                        |
| `monto`                       | `> 0`, copiado de la tasa al confirmar el riesgo (no cambia después).   |
| `numero_recibo`               | NULL hasta el pago; `^[A-Z0-9-]{4,30}$`; único entre esquelas.         |
| `pagada_en`, `registrado_por` | Se llenan con el recibo (CHECK: los tres van juntos).                  |

Dominio (`pagos/dominio/esquela.ts`): `Esquela.generar(numero, receta, monto)`;
`registrarPago(recibo, cajero, ahora)` (falla si ya está pagada); `corregirRecibo(nuevo, motivo)`
(falla si no está pagada, si el motivo tiene menos de 10 caracteres o si el recibo es el mismo).

## 6. `pagos.auditoria` (ya existe)

`REGISTRAR_PAGO` (`recibo_anterior` NULL) y `CORREGIR_RECIBO` (con el anterior, el nuevo y el
motivo). Sin datos del titular.

## 7. `comun.evento_pendiente` (ya existe)

| Tipo                       | Lo escribe | Lo consume        | `datos` (sin datos personales)                                   |
| -------------------------- | ---------- | ----------------- | ---------------------------------------------------------------- |
| `EsquelaSolicitada`        | tramites   | pagos             | `numeroExpediente`, `codigoReceta`, `concepto`, `monto`          |
| `PagoRegistrado`           | pagos      | tramites          | `numeroExpediente`, `codigoEsquela`                              |
| `EstadoExpedienteCambiado` | tramites   | (006)             | `numeroExpediente`, `estadoAnterior`, `estadoNuevo`              |
| `SolicitudPresentada`      | tramites   | (006)             | (de la 004)                                                      |

`intentos`, `ultimo_error` (solo el nombre del error) y `reintentar_en` (nueva en 0008) los usa el
despachador, que reintenta sin límite con espera creciente de hasta 5 minutos (research §R-02).
