# Modelo de datos: Catálogo y Asistente de ruta

Este documento describe solo el esquema `catalogo` (principio III). La migración nueva es
`apps/api/prisma/migrations/0004_catalogo_asistente/migration.sql`. En el mismo PR se reflejan los
cambios en estos archivos de `docs/05-modelo-de-datos/`:
- `esquema.sql`
- `datos-semilla.sql`
- `modelo-entidad-relacion.md`

Decisiones: [research.md](./research.md) §R-04, §R-05 y §R-08.

## 1. Cambios de la migración `0004`

### 1.1 Tabla nueva `catalogo.cambio_receta`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | PK |
| `codigo_receta` | `varchar(10)` | `NOT NULL`, FK → `catalogo.receta(codigo)`, mismo esquema; sin `ON DELETE`, porque las recetas no se borran |
| `usuario_id` | `uuid` | `NOT NULL`; referencia lógica a `seguridad.usuario`, **sin FK** (MD2) |
| `cambiado_en` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `cambios` | `jsonb` | `NOT NULL`, `CHECK (jsonb_typeof(cambios) = 'object' AND cambios <> '{}'::jsonb)` |

Índice: `ix_cambio_receta_receta (codigo_receta, cambiado_en)`.

Formato de `cambios`, con un elemento por campo modificado:

```json
{
  "tasa": { "antes": "177.10", "despues": "180.00" },
  "requisitos": {
    "antes":   [{ "descripcion": "…", "obligatorio": true, "condicion": "SIEMPRE" }],
    "despues": [{ "descripcion": "…", "obligatorio": true, "condicion": "CON_REPRESENTANTE" }]
  }
}
```

Los nombres de campo son los del contrato:
- `tasa`
- `plazoDias`
- `calificacion`
- `ordenItse`
- `plazoItseDias`
- `vigenciaMeses`
- `activa`
- `requisitos`

La tasa se guarda como texto con 2 decimales, igual que en el contrato. Las filas son **inmutables**:
la aplicación nunca hace `UPDATE` ni `DELETE` sobre esta tabla.

### 1.2 Restricción única de `catalogo.requisito`

`UNIQUE (codigo_receta, orden)` se vuelve a crear como `DEFERRABLE INITIALLY DEFERRED`, para
reordenar requisitos dentro de una transacción (§R-04). El nombre de la restricción se conserva.

### 1.3 Datos: opción "No lo sé"

```sql
UPDATE catalogo.pregunta_asistente
SET opciones = opciones || '[{"valor":"NO_SE","texto":"No lo sé"}]'::jsonb
WHERE codigo = 'NIVEL_RIESGO';
```

`regla_asistente` **no cambia**: ninguna regla usa `NO_SE` (aclaración 2).

### 1.4 Columnas existentes que empiezan a usarse

En `catalogo.receta`, `actualizada_por` (uuid, sin FK) y `actualizada_en` se actualizan en cada
guardado que tiene cambios.

## 2. Entidades del dominio (`modulos/catalogo/dominio/`)

| Entidad u objeto de valor | Campos | Reglas |
|---|---|---|
| `RecetaCompleta` | código, nombre, tipo, ruta, código y página del TUPA, nivel de riesgo, tasa (`Tasa`), plazo (`PlazoDiasHabiles` o null), tipo de plazo, calificación, orden del ITSE, plazo del ITSE, vigencia, activa, requisitos, actualizada en | §R-03; `aplicarCambios` devuelve `{ receta, diferencias }` |
| `Requisito` | id (null si es nuevo), orden, descripción, obligatorio, condición | descripción de 1 a 500 caracteres tras `trim`; condición ∈ {`SIEMPRE`, `CON_REPRESENTANTE`, `GIRO_ESPECIAL`, `SIN_PLANOS_VIGENTES`} |
| `CambiosReceta` | subconjunto opcional de los campos editables | al menos un campo (lo valida la presentación); `requisitos` reemplaza la lista |
| `DiferenciaReceta` | `{ campo: { antes, despues } }` | vacía si no hubo cambios reales |
| `PreguntaAsistente` | código, orden, texto, opciones `[{ valor, texto }]` | se leen del catálogo, nunca del código |
| `ReglaAsistente` | prioridad, condiciones `{ pregunta: valor }`, código de receta | prioridad única |
| `ResultadoMotor` | `PROPUESTA` + código de receta, o `NO_DETERMINADA` + motivo | §R-01, §R-02 |

### Coherencia por ruta (`COHERENCIA_POR_RUTA`)

| Tipo / ruta | Calificación | Orden del ITSE | Plazo del ITSE | Vigencia |
|---|---|---|---|---|
| Licencia, ruta A | `APROBACION_AUTOMATICA` | `POSTERIOR` | ≥ 1 | null o ≥ 1 |
| Licencia, ruta B | `EVALUACION_PREVIA_SILENCIO_POSITIVO` | `PREVIA` | ≥ 1 | null o ≥ 1 |
| Licencia, ruta C | `APROBACION_AUTOMATICA` | `DENTRO_6_MESES` | null | null o ≥ 1 |
| Trámite conectado | `APROBACION_AUTOMATICA` o `SERVICIO_EXCLUSIVO` | null | null | null |

Las 12 recetas de la semilla cumplen esta tabla. Una prueba unitaria lo verifica contra
`datos-semilla.sql`.

## 3. Estados de una receta

```text
activa ──(administrador: activa=false)──► desactivada
   ▲                                          │
   └──────(administrador: activa=true)────────┘
```

| Estado | Lista pública | Ficha pública | Asistente | Administración |
|---|---|---|---|---|
| Activa | aparece | 200 | se propone | aparece |
| Desactivada | no aparece | 404 | `NO_DETERMINADA / RECETA_NO_DISPONIBLE` | aparece marcada |

No hay creación ni borrado (FR-018). Cada transición queda en `cambio_receta`
(`activa: true → false`).

## 4. Puertos del dominio

| Puerto | Métodos | Adaptadores |
|---|---|---|
| `RepositorioCatalogo` (se amplía) | `listarActivas(filtro)`, `obtener(codigo)` (activa o no), `listarTodas()`, `obtenerAsistente()` (preguntas y reglas) | `RepositorioCatalogoPostgres`, envuelto por `RepositorioCatalogoConCache` |
| `UnidadDeTrabajoCatalogo` (nuevo) | `ejecutar(codigo, (receta) => resultado)`: bloquea la receta con `FOR UPDATE`, ejecuta el callback y, si devuelve un cambio, guarda la receta, los requisitos y el `cambio_receta` en la misma transacción | `UnidadDeTrabajoCatalogoPostgres` |
| `InvalidadorCacheCatalogo` (nuevo) | `invalidar(codigo)`: borra las claves de la lista y de la receta; si Redis falla, avisa y no lanza | `InvalidadorCacheCatalogoRedis` |
| `Reloj` (local del módulo) | `ahora()` | `RelojSistema` |

Los casos de uso dependen solo de estos puertos (principio I). `ActualizarReceta` llama a
`invalidar` después de que la unidad de trabajo confirma.
