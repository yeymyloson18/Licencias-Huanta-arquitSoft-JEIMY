# Cambios en `docs/06-contrato-api/openapi.yaml` (007)

Solo se ajusta lo necesario en `/reportes/tablero` y `/reportes/licencias`. Ninguna otra operación
cambia.

## `GET /reportes/tablero` (`obtenerTablero`)

- Descripción: solo para el rol JEFATURA. La respuesta lleva `Cache-Control: no-store`. Usa la caché
  de 5 minutos del servidor.
- `desde` y `hasta` pasan a ser **opcionales**. Si faltan, se toma el mes actual (del día 1 a hoy, en
  Lima). Si solo viene uno de los dos, es un error 422.
- Respuesta nueva `422` (`ErrorValidacion`) para fechas inválidas, `desde > hasta` o más de 366 días.
- Esquema `Tablero`:
  - se agregan `desde` y `hasta` (`date`) y `generadoEn` (`date-time`), todos obligatorios;
  - en `tiempoPromedioPorReceta[]` se agrega `atendidos` (entero, obligatorio);
  - `promedioDiasHabiles` y `dentroDelPlazo` pasan a ser `nullable` ("sin datos" o "no aplica" si el
    plazo es 0);
  - `expedientesPorEstado` pasa a usar las claves de `EstadoExpediente` (`propertyNames`).

## `GET /reportes/licencias` (`reporteLicencias`)

- Descripción: solo para el rol JEFATURA. La respuesta lleva `Cache-Control: no-store`. Devuelve 5,000
  filas como máximo.
- Cabecera de respuesta nueva `X-Reporte-Truncado`, con `true` o `false`, en JSON y en CSV: indica
  que hay más filas y que conviene ajustar los filtros.
- `text/csv`:
  - se documenta con la cabecera
    `Content-Disposition: attachment; filename="reporte-<situacion>-<AAAA-MM-DD>.csv"`;
  - el `charset` es `utf-8`, con BOM, separador `;` y fin de línea CRLF;
  - columnas: `numero;codigoReceta;titular;giro;zona;estado;fecha`.
- Respuesta nueva `422` para una `situacion` o un `codigoReceta` inválidos, o para un `giro` o una
  `zona` de más de 150 caracteres.
- `FilaReporte`:
  - todos sus campos pasan a ser obligatorios;
  - `titular` se describe como el "nombre público abreviado (nunca el nombre completo ni datos de
    contacto)";
  - `fecha`: emisión de la licencia (`VIGENTES`), presentación (`EN_TRAMITE`) o vencimiento del ITSE
    (`ITSE_POR_VENCER`).
- Orden de las filas:
  - `VIGENTES`: por número;
  - `EN_TRAMITE`: por presentación, de la más antigua a la más nueva;
  - `ITSE_POR_VENCER`: por vencimiento, del más cercano al más lejano.

## README del contrato

Se agregan a la tabla de operaciones las aclaraciones de la 007: rol, caché, CSV y truncado.
