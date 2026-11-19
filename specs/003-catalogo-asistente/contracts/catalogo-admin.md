# Contrato: ficha pública y edición de recetas

Fuente de verdad: `openapi.yaml` (ver [openapi-cambios.md](./openapi-cambios.md)). Decisiones:
[research.md](../research.md) §R-03 a §R-06.

## Ficha pública: `GET /catalogo/recetas/{codigoReceta}`

| Situación | HTTP | Caché |
|---|---|---|
| Receta activa | 200 `Receta` (requisitos en orden) | `public, max-age=60`; Redis `catalogo:receta:<CODIGO>` durante 240 s |
| Código con formato inválido | 422 | — |
| No existe o está desactivada | 404 `Problema` con el mismo cuerpo en los dos casos | `no-store` |

## Administración (solo ADMINISTRADOR)

Todas las respuestas llevan `Cache-Control: no-store`. Para estas rutas rige la matriz de la 002:

| Petición | Sin sesión | Con sesión y sin rol ADMINISTRADOR | Con rol ADMINISTRADOR |
|---|---|---|---|
| `GET /admin/catalogo/recetas` | 401 | 403 | 200, 12 recetas con `activa` |
| `GET /admin/catalogo/recetas/{codigo}` | 401 | 403 | 200 `RecetaAdmin` (o 404 si no existe) |
| `PUT /catalogo/recetas/{codigo}` | 401 | 403 | 200 / 404 / 422 |

## `PUT /catalogo/recetas/{codigoReceta}`: comportamiento

Pasos, en este orden:
1. Valida la forma del cuerpo contra el contrato. Si falla, responde 422 sin tocar la base.
2. En una sola transacción:
   1. `SELECT … FOR UPDATE` de la receta. Si no existe, responde 404.
   2. `aplicarCambios`. Si hay errores de dominio, responde 422 con **todos** los errores y hace
      `ROLLBACK`.
   3. Si las diferencias están vacías, responde 200 con la receta actual. No escribe nada, no crea
      registro y no invalida la caché.
   4. Si hay diferencias, hace `UPDATE` de la receta (`actualizada_por` y `actualizada_en`), aplica la
      diferencia de los requisitos (update, insert y delete por `id`) e inserta `cambio_receta`.
   5. Hace `COMMIT`. Si cualquier paso falla, hace `ROLLBACK` y no queda ni la receta ni el
      registro.
3. Después del commit, `invalidar(codigo)` borra `catalogo:recetas:*` y `catalogo:receta:<CODIGO>`.
   Si Redis falla, deja un aviso en el registro y responde 200 igual.
4. Responde 200 `RecetaAdmin` con los valores nuevos.

Reglas del cuerpo:
- Si `requisitos` viene, **reemplaza** la lista.
- Un elemento con `id` debe ser un requisito de **esta** receta; si no, responde 422 en
  `requisitos[i].id`.
- No se pueden repetir `id`.
- El `orden` final es la posición en la lista (1…n).

Dos administradores que guardan a la vez: los dos reciben 200 y queda vigente el último. Hay dos
filas en `cambio_receta`, y el "antes" de la segunda es el "después" de la primera.

## Validaciones de dominio (422)

Están en la tabla de [data-model.md](../data-model.md) §2 y en research §R-03. Cada caso tiene su
prueba unitaria y al menos un caso de integración:
- tasa negativa;
- tasa con 3 decimales;
- plazo 0;
- requisito vacío o de solo espacios;
- requisito de 501 caracteres;
- lista vacía;
- licencia de ruta A con `EVALUACION_PREVIA_SILENCIO_POSITIVO`;
- licencia sin `ordenItse`;
- trámite conectado con `vigenciaMeses`;
- `id` de otra receta;
- campos no editables (`nombre`, `ruta`) en el cuerpo.

## Tiempo máximo de propagación (FR-024)

- **Normal:** la siguiente consulta ya ve el cambio, porque la invalidación ocurre después del commit.
- **Si falla la invalidación:** el cambio se ve en 300 s como máximo (240 s de TTL en Redis + 60 s de
  `max-age`).
- **Arranque:** la configuración rechaza `CATALOGO_CACHE_TTL_SEGUNDOS > 240`.
