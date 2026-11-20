# Modelo de datos: Inspección ITSE, licencia con QR, plazos y avisos

Las tablas de `inspecciones`, `licencias`, `plazos` y `notificaciones` ya existen desde la migración
0001 (docs/05). `0010_itse_licencia_plazos` hace solo los cambios que siguen; las migraciones 0001 a
0009 no se editan. `docs/05-modelo-de-datos/esquema.sql` y `modelo-entidad-relacion.md` se actualizan
en el mismo commit (la prueba `esquema-equivalente` los compara).

## Migración 0010

```sql
-- 1. Suspensión del plazo (research §R-04).
ALTER TABLE tramites.expediente ADD COLUMN plazo_restante_dias smallint
    CHECK (plazo_restante_dias IS NULL OR plazo_restante_dias >= 0);

-- 2. Certificado que registra el inspector (lo lee tramites por la fachada, research §R-01).
ALTER TABLE inspecciones.inspeccion
    ADD COLUMN numero_certificado varchar(30),
    ADD COLUMN certificado_emitido_en date,
    ADD CONSTRAINT inspeccion_certificado_check
        CHECK ((numero_certificado IS NULL) = (certificado_emitido_en IS NULL));

-- 3. Quién atendió la alerta (research §R-08).
ALTER TABLE plazos.alerta ADD COLUMN atendida_por uuid;

-- 4. Avisos idempotentes y con espera entre reintentos (research §R-02 y §R-16).
ALTER TABLE notificaciones.mensaje
    ADD COLUMN evento_id bigint UNIQUE,
    ADD COLUMN reintentar_en timestamptz;

-- 5. Feriados nacionales de 2026 (research §R-17).
INSERT INTO plazos.feriado (fecha, descripcion, alcance, registrado_por) VALUES
    ('2026-01-01', 'Año Nuevo', 'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    … (16 filas, tabla de research §R-17)
ON CONFLICT (fecha) DO NOTHING;

-- 6. Los cambios de estado anteriores a la 006 no generan avisos atrasados (análisis H3).
UPDATE comun.evento_pendiente SET procesado_en = now()
 WHERE tipo = 'EstadoExpedienteCambiado' AND procesado_en IS NULL;
```

## 1. `tramites.expediente` (de la 004)

| Columna | Uso en la 006 |
| --- | --- |
| `vence_plazo_en` | Se calcula al presentar (días hábiles del plazo de la receta) y al reanudar; NULL mientras está suspendido o si la receta no tiene plazo |
| `plazo_restante_dias` (nueva) | Días hábiles que quedaban al pasar a OBSERVADO o PENDIENTE_PAGO; NULL fuera de la suspensión |
| `estado` | Nuevas transiciones (ver la máquina de estados) |
| `nombre_titular`, `razon_social`, `nombre_comercial`, `giro`, `zona` | Los lee `licencias` por la fachada para los datos públicos |
| `direccion_cifrada` | Solo se descifra para el inspector asignado (research §R-14) |
| `correo_cifrado`, `celular_cifrado` | Solo se descifran para crear el aviso, que los vuelve a cifrar en `notificaciones` |

`tramites.observacion.plazo_subsanar_en` se llena siempre con 2 días hábiles (research §R-05).

### Máquina de estados (se agrega a la de la 005)

| Acción | Desde | Hacia | Rutas | Disparador |
| --- | --- | --- | --- | --- |
| `INICIAR_INSPECCION_PREVIA` | PAGADO | EN_INSPECCION | B | Pago registrado (misma transacción) |
| `EMITIR_LICENCIA` | APROBADO | LICENCIA_EMITIDA | A | `LicenciaEmitida` |
| `EMITIR_LICENCIA` | EN_INSPECCION | LICENCIA_EMITIDA | B | `LicenciaEmitida` |
| `EMITIR_LICENCIA_PROVISIONAL` | APROBADO | LICENCIA_PROVISIONAL | C | `LicenciaEmitida` |
| `ESPERAR_ITSE_POSTERIOR` | LICENCIA_EMITIDA | ITSE_POSTERIOR_PENDIENTE | A | Después de `EMITIR_LICENCIA` (misma transacción) |
| `FINALIZAR` | LICENCIA_EMITIDA | FINALIZADO | B | Después de `EMITIR_LICENCIA` (misma transacción) |
| `FINALIZAR` | ITSE_POSTERIOR_PENDIENTE | FINALIZADO | A | POSTERIOR favorable |
| `DENEGAR_POR_ITSE` | EN_INSPECCION | DENEGADO | B | PREVIA desfavorable |
| `DERIVAR_A_FISCALIZACION` | ITSE_POSTERIOR_PENDIENTE | DERIVADO_A_FISCALIZACION | A | POSTERIOR desfavorable |
| `DERIVAR_A_FISCALIZACION` | LICENCIA_PROVISIONAL | DERIVADO_A_FISCALIZACION | C | BODEGA desfavorable |

Estas transiciones son del sistema: historial con `usuario_id` NULL y comentario en lenguaje sencillo;
no escriben en `tramites.auditoria` (las personas ya quedan en la auditoría de su módulo). Cada una
publica `EstadoExpedienteCambiado`. Un evento que llega con el expediente ya en el estado destino no
hace nada (idempotente); en un estado inesperado falla y se reintenta.

## 2. `inspecciones.inspeccion`, `foto` y `auditoria` (de la 0001)

- Una inspección por expediente y tipo (`UNIQUE (numero_expediente, tipo)`): se crea PENDIENTE desde
  `InspeccionRequerida`.
- Asignar: `inspector_id`, `programada_para` (no pasada), estado ASIGNADA; se puede reasignar sin
  resultado. Auditoría `ASIGNAR_INSPECTOR` con `{inspectorId, programadaPara}`.
- Registrar resultado: `UPDATE … WHERE id = ? AND estado = 'ASIGNADA' AND inspector_id = ?`
  (condicional: un segundo registro no cambia filas → 409); `resultado`, `observaciones` (hasta 4000,
  obligatorias si es DESFAVORABLE), `registrada_en`, estado REALIZADA; con FAVORABLE,
  `numero_certificado` (normalizado, 4 a 30 de `[A-Z0-9/-]`) y `certificado_emitido_en` (no futura).
  Fotos (1 a 5, JPG o PNG, hasta 10 MB) en `inspecciones.foto` con claves `inspecciones/<id>/<uuid>`.
  Auditoría `REGISTRAR_RESULTADO` con `{resultado, fotos}` (sin observaciones). Publica
  `ResultadoITSERegistrado`.

## 3. `licencias.licencia`, `certificado_itse` y `auditoria` (de la 0001)

- Emitir (desde `LicenciaSolicitada`): si ya hay una VIGENTE para el expediente, no hace nada (y vuelve
  a publicar `LicenciaEmitida` para que `tramites` avance si se cayó antes). Si no, inserta con
  número, código de verificación, datos públicos y `vigente_hasta` (emisión + `vigencia_meses` para la
  PROVISIONAL; NULL para la DEFINITIVA); el índice `ux_licencia_vigente_por_expediente` impide dos.
  Con certificado (ruta B), inserta `certificado_itse` con `vence_en = emitido_en + 2 años`. Auditoría
  `EMITIR` o `EMITIR_PROVISIONAL` con `usuario_id` NULL. Todo en una transacción con el evento
  `LicenciaEmitida`.
- Registrar certificado (desde `CertificadoItseRegistrado`): en la licencia vigente del expediente;
  `ON CONFLICT (numero) DO NOTHING`.
- Aviso de vencimiento: `aviso_enviado_en` se marca una sola vez junto con el evento `ItsePorVencer`.
- `estado` VENCIDA se calcula al leer cuando `vigente_hasta < hoy` (no hay tarea que la cambie).
- `clave_pdf` no se usa: el PDF se genera al pedirlo (como la esquela).

## 4. `plazos.feriado` y `alerta` (de la 0001)

- Feriado: `fecha` es la clave (una repetida → 409); `descripcion` hasta 150; `alcance` NACIONAL,
  REGIONAL o LOCAL; `registrado_por` = el administrador.
- Alerta: `UNIQUE (numero_expediente, vence_en)`; `dias_habiles_restantes` al generarla;
  `atendida_en` y `atendida_por` (nueva) al atenderla. Un nuevo vencimiento (por reanudación) genera
  otra alerta.

## 5. `notificaciones.mensaje` (de la 0001)

| Columna | Uso |
| --- | --- |
| `canal` | CORREO si el titular dio correo; si no, SMS |
| `destino_cifrado` | Correo o celular cifrado con el protector de datos |
| `plantilla` | `CAMBIO_ESTADO` o `ITSE_POR_VENCER` |
| `datos` | `{numeroExpediente, estado, descripcion, siguientePaso}` o `{numeroExpediente, venceEn}`: sin datos personales |
| `evento_id` (nueva, UNIQUE) | Evento que lo originó: un reintento no duplica el aviso |
| `estado`, `intentos`, `ultimo_error`, `reintentar_en` (nueva), `enviado_en` | Envío con hasta 5 intentos y espera creciente (5 s × 2^n, máximo 10 min); `ultimo_error` guarda solo el nombre del error |

## 6. Eventos (`comun.evento_pendiente`)

Solo datos no personales (número de expediente, tipo, resultado, número de licencia o certificado,
fechas). Ver la tabla de research §R-01.
