# Estrategia de caché (Sprint 2)

Hay tres niveles de caché:

1. **Redis** (compartido por todas las réplicas de la API).
2. **El navegador**, con las cabeceras `Cache-Control`.
3. **La caché interna de PostgreSQL** (`shared_buffers`), que se mide en
   [base-de-datos.md](base-de-datos.md).

Redis también guarda contadores de seguridad, pero eso **no es caché**. Esos datos no se pueden
perder ni inventar, y se tratan distinto cuando Redis falla.

## 1. Qué se guarda en Redis

| Clave | Qué guarda | Vida (TTL) | Quién la invalida | Archivo |
| --- | --- | --- | --- | --- |
| `catalogo:recetas:<tipo>` | Lista pública de recetas (LICENCIA, TRAMITE_CONECTADO o TODOS) | 240 s | Al guardar una receta, `InvalidadorCacheCatalogoRedis` borra las tres listas | `apps/api/src/modulos/catalogo/infraestructura/repositorio-catalogo-con-cache.ts` — «`catalogo:recetas:${tipo ?? 'TODOS'}`» |
| `catalogo:receta:<código>` | Ficha completa de una receta con sus requisitos | 240 s | Al guardar esa receta | `apps/api/src/modulos/catalogo/infraestructura/invalidador-cache-catalogo-redis.ts` — «`CLAVES_CACHE_CATALOGO.receta(codigo)`» |
| `catalogo:asistente` | Preguntas y reglas del asistente | 240 s | Al cambiar el catálogo, por TTL | `apps/api/src/modulos/catalogo/infraestructura/repositorio-catalogo-con-cache.ts` — «`asistente: 'catalogo:asistente'`» |
| `rep:tablero:<desde>:<hasta>` | Indicadores del tablero de la jefatura | 300 s | Por TTL (5 minutos de retraso aceptados) | `apps/api/src/modulos/reportes/aplicacion/obtener-tablero.ts` — «`rep:tablero:${rango.desde}:${rango.hasta}`» |
| `rep:licencias:<situación>:<receta>:<huella>` | Reporte de licencias (filas con titular público) | 300 s | Por TTL | `apps/api/src/modulos/reportes/aplicacion/reporte-licencias.ts` — «`rep:licencias:${filtro.situacion}`» |

**Por qué 240 s más 60 s**:

- La respuesta del catálogo lleva `Cache-Control: public, max-age=60`.
- En el peor caso, un cambio del TUPA tarda 240 s en salir de Redis (si fallara el borrado) más 60 s en
  el navegador: **5 minutos como máximo** (FR-024 de la 003).
- La configuración no deja subir el TTL de Redis por encima de 240:
  `apps/api/src/compartido/infraestructura/configuracion.ts` — «`TTL de Redis + 60 s del navegador no puede superar 5 minutos`».

**Patrón**:

- *cache-aside* con un **decorador**: `RepositorioCatalogoConCache` envuelve al repositorio de
  PostgreSQL con la misma interfaz `RepositorioCatalogo`.
- Los casos de uso no saben que existe la caché.
- Los reportes usan la función `conCache` de
  `apps/api/src/modulos/reportes/aplicacion/cache.ts` — «`export const conCache`».

## 2. Qué NO se guarda en Redis, y por qué

- **Datos personales**: nunca. No se guardan ni el expediente, ni el titular, ni el documento, ni el
  celular, ni la dirección.
  - La consulta pública siempre va a PostgreSQL, que tiene los datos cifrados.
  - Las claves de los reportes llevan fechas, códigos de receta y una huella del giro y la zona, nunca
    nombres.
  - La prueba de privacidad de la 007 revisa las claves y los valores `rep:*`
    (`apps/api/test/integracion/privacidad-007.e2e-spec.ts`).
- **Respuestas con datos del usuario o del personal**: llevan `Cache-Control: no-store` y no se
  guardan en ningún lado. Por ejemplo: bandeja, detalle, auditoría, tablero, consulta pública y
  esquelas.
- **Escrituras**: pagos, decisiones e inspecciones van siempre a PostgreSQL en una transacción.

## 3. Redis como almacén de seguridad (no es caché)

| Clave | Para qué | Si Redis falla |
| --- | --- | --- |
| `lim:fallos:ip:*`, `lim:fallos:correo:*`, `lim:envios:usuario:*` | Límite de intentos del ingreso del personal (5 en 15 min) | **Se cierra**: el ingreso responde 503. Contar en memoria por réplica multiplicaría los intentos (ADR-005) |
| `lim:identidad:*` | Límite de verificaciones de identidad del administrado | **Se cierra** (503) |
| `lim:consulta:ip:*` | Límite de consultas fallidas por origen (RF03, EQ-04) | **Se cierra** (503) |
| `lim:verificacion:ip:*` | Límite de códigos de verificación de licencias inválidos | **Se cierra** (503) |
| `seg:version:*`, `seg:sesion-revocada:*` | Revocar sesiones al cambiar la clave o los roles | **Se cierra**: el token no se acepta |
| `dev:otp:*`, `dev:aviso:*` | Solo con el envío **simulado** (desarrollo y pruebas) | No aplica en producción |

Ejemplo del cierre:
`apps/api/src/modulos/seguridad/infraestructura/limitador-intentos-redis.ts` — «`throw new ErrorLimitadorNoDisponible();`».

## 4. Si Redis falla

| Lectura | Comportamiento | Archivo |
| --- | --- | --- |
| Catálogo y asistente | **Sigue desde PostgreSQL**: el decorador captura el error, avisa y lee de la base | `apps/api/src/modulos/catalogo/infraestructura/repositorio-catalogo-con-cache.ts` — «`Si Redis falla, el catálogo se sigue sirviendo desde`» |
| Tablero y reporte | **Calcula directo** y avisa sin parámetros | `apps/api/src/modulos/reportes/aplicacion/cache.ts` — «`No se pudo leer la caché de reportes; se calcula directo`» |
| Invalidación al guardar una receta | Avisa; el TTL de 240 s pone el límite | `apps/api/src/modulos/catalogo/infraestructura/invalidador-cache-catalogo-redis.ts` — «`el TTL de 240 s pone el límite`» |
| Ingreso, límites de intentos y sesiones | **Se cierra** (503), ver §3 | — |
| Salud del sistema | `/api/v1/salud` responde `DEGRADADO`; la instancia sigue recibiendo tráfico (ADR-005) | `apps/api/src/operacion/salud/` |

La carga del Sprint 2 lo comprueba: la segunda pasada del catálogo corre **con Redis detenido** y debe
responder sin errores (§6).

## 5. Cabeceras `Cache-Control`

| Ruta | Cabecera | Dónde se define |
| --- | --- | --- |
| `/assets/*` del portal (nombres con huella) | `public, max-age=31536000, immutable` | `apps/web/nginx.conf` y `infra/produccion/Caddyfile` |
| `/` e `index.html` del portal | `no-cache` (siempre se revalida) | `apps/web/nginx.conf` y `infra/produccion/Caddyfile` |
| `GET /api/v1/catalogo/*` y `GET /api/v1/asistente/preguntas` | `public, max-age=60` | `apps/api/src/modulos/catalogo/presentacion/catalogo.controller.ts` — «`const CACHE_PUBLICA = 'public, max-age=60';`» |
| Administración del catálogo, propuesta del asistente, 404 de una receta | `no-store` | `apps/api/src/modulos/catalogo/presentacion/asistente.controller.ts` — «`const SIN_CACHE = 'no-store';`» |
| Consulta pública, expedientes, esquelas, licencias, tablero y reportes | `no-store` | Cada controlador |
| `/api/docs/openapi.json` y la página de la documentación | `no-cache` (archivos de Swagger UI: 1 día) | `apps/api/src/operacion/documentacion/documentacion.ts` |

En producción, Caddy además **comprime** las respuestas (zstd o gzip). nginx también lo hace en
desarrollo (`gzip on`).

## 6. Medición durante la carga

El job `carga` del flujo [`carga-sprint2.yml`](../../.github/workflows/carga-sprint2.yml) mide dos
cosas:

- **Tasa de aciertos de Redis**: `keyspace_hits` y `keyspace_misses` antes y después de la carga
  progresiva, y cada 10 s en `recursos.jsonl`.
  `tasa = Δhits / (Δhits + Δmisses)`.
- **Latencia con y sin caché**: [`tests/carga/cache-comparacion.js`](../../tests/carga/cache-comparacion.js)
  (50 usuarios, 1 minuto, solo catálogo) corre dos veces, con Redis y con Redis detenido. Se comparan
  el p50 y el p95.

Resultado de la corrida 45106710381 (evidencia en
[`evidencias/carga-2000-despues.txt`](evidencias/carga-2000-despues.txt)):

| Caché | Peticiones | p50 (ms) | p95 (ms) | Errores |
| --- | --- | --- | --- | --- |
| Con Redis | 3,006 | 1 | 1 | 0.00 % |
| Sin Redis (PostgreSQL directo) | 3,008 | 2 | 3 | 0.00 % |

| Medida | Resultado |
| --- | --- |
| Tasa de aciertos de Redis durante la carga | **99.99 %** (602,479 aciertos y 36 fallos; antes de la carga: 0 y 3) |

Lo esperado:

- Con Redis, el catálogo responde sin tocar la base después del primer acierto.
- Sin Redis, responde igual (cero errores), pero con más latencia y más carga en PostgreSQL.

Lo obtenido confirma lo esperado: con Redis el p95 del catálogo es **3 veces menor** (1 ms frente a
3 ms) y, al detener Redis, el sistema siguió respondiendo sin errores leyendo de PostgreSQL (la caché
"falla abierta" en lecturas). Con 50 usuarios la diferencia es pequeña porque los datos de PostgreSQL
también están en memoria; su valor real se ve con 2,000 usuarios: PostgreSQL no pasó de 2 conexiones
activas porque Redis atendió el 99.99 % de las lecturas.
