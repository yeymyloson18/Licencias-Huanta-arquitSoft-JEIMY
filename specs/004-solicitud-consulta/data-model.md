# Modelo de datos: Presentar solicitud y consultar el estado del trámite

Fuente de verdad: `docs/05-modelo-de-datos/esquema.sql` (estado actual) y las migraciones de
`apps/api/prisma/migrations/`. Esta funcionalidad agrega la migración **`0006_solicitud_consulta`**
sin tocar `0001` a `0005`, y actualiza `esquema.sql`, `modelo-entidad-relacion.md` y
`apps/api/prisma/schema.prisma` en el mismo PR. La prueba `esquema-equivalente` debe seguir pasando.

## 1. Cambios de la migración 0006

### `tramites.expediente` (ya existe; se amplía)

| Columna nueva | Tipo | Regla |
|---|---|---|
| `receta_al_presentar` | `jsonb NOT NULL` | Copia de la receta vigente al presentar (FR-017): `{ codigo, nombre, ruta, tasa, plazoDias, tipoPlazo, calificacion, ordenItse, plazoItseDias, vigenciaMeses, requisitos: [{ id, orden, descripcion, obligatorio, condicion }] }`. Sin datos personales |
| `verificacion_id` | `uuid NULL` | Verificación de identidad usada al presentar en línea (referencia lógica a `seguridad.verificacion_identidad`, sin FK, MD2). Índice único parcial `WHERE verificacion_id IS NOT NULL`: un permiso, un expediente (research §R-04) |
| `con_representante` | `boolean NOT NULL DEFAULT false` | Si actuó un representante; decide si el requisito `CON_REPRESENTANTE` aplicaba |

Restricciones nuevas:
- `CHECK (numero ~ '^EXP-[0-9]{4}-[0-9]{6}$')`.
- `CHECK ((canal = 'EN_LINEA') = (verificacion_id IS NOT NULL))`.
- `CHECK ((canal = 'MESA_PARTES') = (registrado_por IS NOT NULL))`.
- `CHECK (con_representante = (representante_cifrado IS NOT NULL))`.

Se mantienen sin cambios: el número (`numero_expediente_seq`, que ya existe, research §R-10), los
datos personales cifrados (`documento_cifrado`, `ruc_cifrado`, `celular_cifrado`, `correo_cifrado`,
`representante_cifrado`, `direccion_cifrada`), las huellas `documento_hmac` y `ruc_hmac` con el
índice `ix_expediente_consulta`, y `vence_plazo_en` vacío hasta la 008 (FR-022).

### `tramites.documento_temporal` (nueva)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | Es el `documentoId` que devuelve `POST /documentos` |
| `clave_almacen` | `varchar(300) NOT NULL UNIQUE` | Nombre aleatorio en el almacén; nunca el nombre original |
| `nombre_original` | `varchar(255) NOT NULL` | Solo para mostrarlo al personal; se recorta y se limpia de rutas |
| `tipo_mime` | `varchar(80) NOT NULL` | `application/pdf`, `image/jpeg` o `image/png`, según los primeros bytes |
| `tamano_bytes` | `integer NOT NULL` | `BETWEEN 1 AND 10485760` |
| `sha256` | `char(64) NOT NULL` | Huella del contenido |
| `verificacion_id` | `uuid NULL` | Quién lo subió en línea (sin FK) |
| `usuario_id` | `uuid NULL` | Quién lo subió en mesa de partes (sin FK) |
| `subido_en` | `timestamptz NOT NULL DEFAULT now()` | Se descarta a las 24 horas (FR-014) |

`CHECK ((verificacion_id IS NULL) <> (usuario_id IS NULL))`. Índice `(subido_en)` para la limpieza.

### `tramites.documento` (ya existe; se amplía)

| Columna nueva | Tipo | Regla |
|---|---|---|
| `requisito_orden` | `smallint NOT NULL` | Orden del requisito en `receta_al_presentar`, para mostrar los documentos en el orden del catálogo aunque luego cambie |

`requisito_id` sigue siendo la referencia lógica a `catalogo.requisito` (003 conserva los `id` al
editar).

### `tramites.clave_idempotencia` (nueva)

| Columna | Tipo | Regla |
|---|---|---|
| `clave` | `uuid PK` | Cabecera `Idempotency-Key` |
| `huella_cuerpo` | `char(64) NOT NULL` | SHA-256 del cuerpo canónico; otro cuerpo con la misma clave → 422 |
| `expediente_id` | `uuid NOT NULL REFERENCES tramites.expediente (id)` | Expediente creado |
| `creada_en` | `timestamptz NOT NULL DEFAULT now()` | |

### `tramites.auditoria` (ya existe; se amplía)

- `accion` admite además `PRESENTAR_EN_LINEA` y `VER_DETALLE` (`REGISTRAR_PRESENCIAL` ya existe).
- `usuario_id` pasa a `NULL` con `CHECK (accion = 'PRESENTAR_EN_LINEA' OR usuario_id IS NOT NULL)`:
  en línea no hay usuario del personal; `detalle` guarda `{ "canal": "EN_LINEA" }`. Nunca datos
  personales.

### `seguridad.verificacion_identidad` (ya existe; se amplía)

| Columna nueva | Tipo | Regla |
|---|---|---|
| `representante_documento_hmac` | `bytea NULL` | Huella del documento del representante (research §R-01); `CHECK (con_representante = (representante_documento_hmac IS NOT NULL))` |

`resultado_servicio` conserva sus valores (`VALIDO`, `NO_VALIDO`, `NO_DISPONIBLE`); el adaptador
traduce `COINCIDE` → `VALIDO` y `NO_COINCIDE` → `NO_VALIDO`. No se agregan datos personales en claro
ni cifrados (research §R-05).

### `comun.evento_pendiente`

Sin cambios de estructura. Nuevo tipo `SolicitudPresentada` con `datos = { numeroExpediente,
codigoReceta, ruta, canal }` (sin datos personales).

## 2. Entidades del dominio (`modulos/tramites/dominio/`)

| Entidad u objeto de valor | Campos | Reglas |
|---|---|---|
| `NumeroExpediente` | valor | `^EXP-[0-9]{4}-[0-9]{6}$`; `normalizar` quita espacios y pasa a mayúsculas; `crear(anio, correlativo)` rellena a 6 cifras |
| `Expediente` (agregado) | número, receta al presentar, ruta, estado, canal, titular, representante, establecimiento, documentos, presentado en, registrado por, verificación | Se crea solo en `REGISTRADO`; la ruta sale de la receta; trae su primer `RegistroHistorial` |
| `RecetaAlPresentar` | copia de la receta vigente | Solo licencias activas (no trámites conectados) |
| `ClasificacionRequisitos` | obligatorios, opcionales, no aplican | `clasificarRequisitos(receta, conRepresentante)` y `faltantes(...)` (research §R-11) |
| `Establecimiento` | nombre comercial, giro, dirección, zona, área | giro ≤ 150, dirección ≤ 300, zona ≤ 60, área > 0; licencia de bodega (ruta C) ≤ 50 m² (FR-015) |
| `TipoArchivo` | `PDF`, `JPEG`, `PNG` | `detectarTipoArchivo(primerosBytes)` |
| `EstadoPublico` | estado, descripción, siguiente paso | `TEXTO_ESTADO_PUBLICO`: un texto sencillo por cada estado de `EstadoExpediente` |

## 3. Estados

En esta funcionalidad solo se crea el estado inicial:

```text
(presentación) ──► REGISTRADO
```

`REGISTRADO` queda en `historial_estado` con `estado_anterior = NULL`, `usuario_id` del personal en
mesa de partes o `NULL` en línea, y el comentario "Presentada en línea" o "Registrada en mesa de
partes". Las demás transiciones son de la 005 a la 009.

## 4. Datos personales (Ley N.° 29733)

| Dato | Dónde | Cómo |
|---|---|---|
| Documento y RUC del titular | `expediente` | Cifrados + HMAC para la consulta |
| Celular, correo, dirección | `expediente` | Cifrados |
| Representante (tipo y número de documento) | `expediente.representante_cifrado` | JSON cifrado |
| Huellas de identidad | `seguridad.verificacion_identidad`, `codigo_otp` | Solo HMAC |
| Nombre del titular y razón social | `expediente` | En claro (los necesitan la bandeja y caja, como ya preveía el modelo) |

Ninguna de estas columnas aparece en URL, registros de la aplicación, mensajes de error, eventos ni
auditoría.
