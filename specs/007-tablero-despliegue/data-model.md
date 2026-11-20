# Modelo de datos: Tablero, despliegue y pruebas del sistema (007)

## 1. Tablas

No hay tablas nuevas ni columnas nuevas. El módulo `reportes` no tiene esquema propio porque no
guarda datos: calcula sobre lo que le entregan las fachadas y deja el resultado 5 minutos en Redis.

## 2. Migración `0011_indices_reportes` (solo índices, compatible con la vuelta atrás)

| Índice | Tabla | Columnas | Para qué |
| --- | --- | --- | --- |
| `ix_expediente_presentado` | `tramites.expediente` | `(presentado_en)` | Conteo por estado de los presentados en el rango |
| `ix_historial_decision` | `tramites.historial_estado` | `(ocurrido_en) WHERE estado_nuevo IN ('APROBADO','LICENCIA_EMITIDA','LICENCIA_PROVISIONAL','DENEGADO')` | Expedientes cuya atención terminó en el rango |
| `ix_licencia_situacion` | `licencias.licencia` | `(estado, codigo_receta)` | Reporte de vigentes |
| `ix_certificado_vence` | `licencias.certificado_itse` | `(vence_en)` | Reporte de ITSE por vencer (el índice de la 006 solo cubre los no avisados) |

`ix_esquela_pagada_en` (de la 0001) ya cubre los ingresos. Los índices nuevos también van en
`docs/05-modelo-de-datos/esquema.sql`, y la prueba de esquema equivalente debe seguir en verde.

## 3. Datos que entregan las fachadas (lectura, sin datos personales)

| Fachada | Método nuevo | Devuelve |
| --- | --- | --- |
| `FachadaTramites` | `conteoPorEstado(desde, hasta)` | `Record<estado, número>` de los presentados en `[desde, hasta]` (Lima) |
| `FachadaTramites` | `atencionesTerminadas(desde, hasta)` | `{ numero, codigoReceta, presentadoEn: Fecha, terminadoEn: Fecha, suspensiones: {desde: Fecha, hasta: Fecha}[] }[]`, donde `terminadoEn` es la primera decisión final y cae en el rango |
| `FachadaTramites` | `expedientesEnTramite(filtro)` | `{ numero, codigoReceta, titularPublico, giro, zona, estado, presentadoEn }[]` (estados que no son finales ni con licencia), con `limite + 1` filas |
| `FachadaPagos` | `pagosRegistrados(desde, hasta)` | `{ codigoReceta, monto: "0.00", pagadoEn: Fecha }[]` |
| `FachadaLicencias` | `licenciasVigentes(filtro)` | `{ numero, codigoReceta, titularPublico, giro, zona, estado, emitidaEn }[]` |
| `FachadaLicencias` | `itsePorVencer(filtro, hasta)` | Igual que las vigentes, con `fecha = vence_en`, ordenadas por vencimiento ascendente |
| `FachadaPlazos` | `feriadosEntre(desde, hasta)` | `Fecha[]` |
| `FachadaCatalogo` | `plazosPorReceta()` | `{ codigoReceta, nombre, plazoDias }[]` de las recetas vigentes |

Los filtros son `{ codigoReceta?, giro?, zona?, limite }`. El giro y la zona se comparan sin
distinguir mayúsculas ni tildes, con igualdad exacta tras normalizar.

## 4. Objetos del dominio de `reportes`

- **`RangoFechas`**: `desde` y `hasta` en formato `AAAA-MM-DD`, en hora de Lima. Reglas:
  - las dos fechas deben ser válidas;
  - `desde` ≤ `hasta`;
  - el rango es de 366 días o menos;
  - por defecto, del día 1 del mes actual a hoy.
- **`Atencion`**: `diasHabiles(calendario)` = días hábiles entre `presentadoEn` y `terminadoEn`,
  menos los de cada suspensión, recortada al intervalo, con un mínimo de 0. `dentroDelPlazo(plazo)`
  es `dias ≤ plazo`, o `null` si el plazo es 0.
- **`Tablero`**:
  - `expedientesPorEstado`;
  - `tiempoPromedioPorReceta[]`, con `{ codigoReceta, plazoTupaDias, atendidos,
    promedioDiasHabiles: number | null (1 decimal), dentroDelPlazo: number | null (porcentaje, 1
    decimal) }` en orden de código;
  - `ingresos { total: "0.00", porReceta: Record<código, "0.00"> }`;
  - `desde`, `hasta` y `generadoEn`.
- **`Centimos`**: `bigint`. `deSoles("177.10")` acepta `^\d{1,8}\.\d{2}$`. `aSoles(n)` devuelve
  `"177.10"`.
- **`FilaReporte`**: `numero`, `codigoReceta`, `titular` (público), `giro`, `zona`, `estado` y
  `fecha`.
- **`Csv`**:
  - BOM `﻿`, separador `;` y fin de línea `\r\n`;
  - cabecera `numero;codigoReceta;titular;giro;zona;estado;fecha`;
  - se ponen entre comillas los valores con `;`, `"`, `\r` o `\n`, y se duplican sus comillas;
  - un valor que empieza con `=`, `+`, `-`, `@`, tabulador o `\r` lleva un apóstrofo delante.

## 5. Caché (Redis)

| Clave | Valor | Vida |
| --- | --- | --- |
| `rep:tablero:<desde>:<hasta>` | JSON del `Tablero` | 300 s |
| `rep:licencias:<situacion>:<receta o *>:<sha256(giro\|zona) 16 hex>` | JSON `{ filas, truncado }` | 300 s |

Las claves no llevan datos personales. Si Redis falla, el sistema calcula directo.

## 6. Configuración de producción (servidor, nunca en el repositorio)

Variables de `infra/produccion/.env`. El repositorio solo tiene `.env.ejemplo`, con los nombres.

- **Dominio y versión**:
  - `DOMINIO`, por ejemplo `203-0-113-10.sslip.io`;
  - `IMAGEN_API`, `IMAGEN_PORTAL` y `VERSION`.
- **Base de datos**: `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB`.
- **Secretos de la aplicación**: `JWT_SECRETO`, `CLAVE_CIFRADO_DATOS` y `CLAVE_HMAC_DATOS`.
- **Comportamiento**: `ENVIO_OTP` (simulado mientras no haya SMS), `TRUST_PROXY_SALTOS`,
  `RELOJ_PLAZOS_INTERVALO_MS`, `AVISOS_INTERVALO_MS` y `URL_PUBLICA_PORTAL` (`https://${DOMINIO}`).
- **PgBouncer**: `PGBOUNCER_POOL`.

Los respaldos quedan en `/home/despliegue/respaldos/`:

- `licencias-AAAAMMDD-HHMM.dump`;
- `documentos-AAAAMMDD-HHMM.tar.gz`.

La carpeta tiene permisos `700`, los archivos `600` y se conservan 7 días.
