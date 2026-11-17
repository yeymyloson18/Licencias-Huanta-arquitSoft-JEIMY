# Modelo de datos (fase 1): Esqueleto del sistema

Esta funcionalidad **no cambia** el modelo físico: usa `docs/05-modelo-de-datos/esquema.sql` y
`datos-semilla.sql` tal como están (ver [research.md](./research.md) §R-03). Aquí se describen las
entidades que el código maneja y sus reglas.

## 1. Receta (módulo `catalogo`, solo lectura)

Fuente: tabla `catalogo.receta`. Contrato: esquema `RecetaResumen`.

| Campo de dominio | Columna | Tipo de dominio | Reglas |
|---|---|---|---|
| `codigo` | `codigo` | `CodigoReceta` (objeto de valor) | Patrón `^(LIC-0[1-9]\|TRF-01\|CGI-01\|DUP-01)$`. |
| `nombre` | `nombre` | `string` | No vacío, ≤ 150 caracteres. |
| `tipo` | `tipo` | `TipoReceta` = `LICENCIA` \| `TRAMITE_CONECTADO` | — |
| `ruta` | `ruta` | `Ruta` = `A` \| `B` \| `C` \| `null` | Obligatoria si `tipo = LICENCIA`. |
| `tasa` | `tasa` (`numeric(10,2)`) | `Tasa` (objeto de valor) | Se guarda en **céntimos enteros** para no perder precisión; ≥ 0 (0 = gratuito, LIC-09). Se serializa como texto `"159.50"` (`Soles`). |
| `plazoDias` | `plazo_dias` | `PlazoDiasHabiles` \| `null` | Entero > 0 cuando existe. |
| `activa` | `activa` | `boolean` | Solo se listan recetas activas. |

**Objetos de valor**

- `Tasa`: se construye desde texto decimal (`"305.90"`) o céntimos; rechaza negativos y más de 2
  decimales; `aTextoSoles()` devuelve `"305.90"`.
- `PlazoDiasHabiles`: entero positivo; `null` se representa fuera del objeto (campo opcional).
- `CodigoReceta`: valida el patrón del contrato.

**Puerto** `RepositorioCatalogo` (en `dominio/`):

```text
listarActivas(filtro: { tipo?: TipoReceta }): Promise<Receta[]>   // ordenadas por código
```

**Adaptadores** (en `infraestructura/`):

- `RepositorioCatalogoPostgres`: consulta Prisma sobre `catalogo.receta` con `activa = true` y el
  filtro de tipo; convierte `Decimal` → `Tasa`.
- `RepositorioCatalogoConCache` (Decorator): clave `catalogo:recetas:<TIPO|TODOS>`, TTL 300 s;
  ante un fallo de Redis delega en el repositorio Postgres.

**Caso de uso** `ListarRecetas` (en `aplicacion/`): recibe `tipo` opcional ya validado y devuelve
`RecetaResumen[]` (DTO plano). No conoce Redis ni Prisma.

**Datos esperados tras las migraciones**: 9 recetas `LICENCIA` (LIC-01 a LIC-09) y 3
`TRAMITE_CONECTADO` (TRF-01, CGI-01, DUP-01), con las tasas y plazos de `datos-semilla.sql`.

## 2. Estado de salud (`operacion/salud`, no se almacena)

Contrato: esquema `Salud`.

| Campo | Tipo | Reglas |
|---|---|---|
| `estado` | `OK` \| `DEGRADADO` \| `CAIDO` | Derivado por `calcularEstadoGeneral`. |
| `baseDeDatos` | `OK` \| `CAIDO` | `CAIDO` si la sonda falla o supera 2 s. |
| `cache` | `OK` \| `CAIDO` | `CAIDO` si la sonda falla o supera 2 s. |
| `version` | `string` | De `VERSION_SERVICIO`; nunca incluye datos de conexión. |

**Regla de derivación** (función pura en `dominio/`):

| baseDeDatos | cache | estado | HTTP |
|---|---|---|---|
| OK | OK | OK | 200 |
| OK | CAIDO | DEGRADADO | 200 |
| CAIDO | OK | CAIDO | 503 |
| CAIDO | CAIDO | CAIDO | 503 |

**Transiciones**: no hay estado guardado; cada consulta recalcula. Por eso pasa de `CAIDO`/`DEGRADADO`
a `OK` sin reiniciar en cuanto la dependencia vuelve (casos límite de la especificación).

**Puerto** `SondaDependencia` (en `dominio/`): `comprobar(): Promise<void>` (resuelve si responde,
rechaza si no). Adaptadores: `SondaPostgres` (`SELECT 1`) y `SondaRedis` (`PING`).

## 3. Módulo (estructura)

| Carpeta | Esquema PostgreSQL | Contenido en 001 |
|---|---|---|
| `seguridad` | `seguridad` | vacío (4 capas con `.gitkeep`) |
| `catalogo` | `catalogo` | `Receta`, `ListarRecetas`, repositorios, controlador, `fachada.ts` |
| `tramites` | `tramites` | vacío |
| `pagos` | `pagos` | vacío |
| `inspecciones` | `inspecciones` | vacío |
| `licencias` | `licencias` | vacío |
| `plazos` | `plazos` | vacío |
| `notificaciones` | `notificaciones` | vacío |
| `reportes` | — (lee mediante fachadas) | vacío |

El esquema `comun` (outbox y ejecución de tareas) se crea con la migración inicial, pero no lo usa
ningún código en esta funcionalidad.

## 4. Migraciones

| Migración | Contenido | Entornos |
|---|---|---|
| `0001_esquema_inicial` | Copia literal de `esquema.sql` (9 esquemas, tablas, índices). | Todos |
| `0002_datos_semilla` | Copia literal de `datos-semilla.sql` (roles, 12 recetas, requisitos, asistente). | Todos, incluida producción |

Cada migración se aplica una sola vez (`_prisma_migrations`); volver a levantar no duplica datos.
