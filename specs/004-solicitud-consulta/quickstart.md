# Guía de validación: Presentar solicitud y consultar el estado del trámite

Comprueba la funcionalidad 004 de punta a punta con datos **ficticios**. No uses el stack principal
ni su administrador: valida en un clon con su propio nombre de proyecto de Compose y sus propios
puertos, o con un PostgreSQL temporal en el puerto 5433 y un Redis aislado (ver la memoria del
proyecto sobre el puerto 5432).

## Requisitos previos

- Docker y Node.js 24; el stack levantado con el comando único en un clon aislado.
- Variables: `API=http://localhost:<puerto>/api/v1`.
- Un usuario de prueba con rol MESA_PARTES y otro con rol EVALUADOR, creados por el administrador de
  prueba del clon (002), con su token tras iniciar sesión con el código simulado.

## Datos del servicio de identificación simulado (research §R-02)

| Persona ficticia | Tipo | Número | Fecha de emisión | RUC | Resultado |
|---|---|---|---|---|---|
| Titular de prueba 1 | DNI | `40000001` | `2020-01-15` | `10400000011` | `COINCIDE` |
| Representante de prueba | DNI | `40000002` | `2019-05-10` | — | `COINCIDE` (como representante) |
| Titular extranjero de prueba | CE | `000123456` | — | `15000123456` | `COINCIDE` |
| Servicio caído | DNI | `49999999` | cualquiera | cualquiera | `NO_DISPONIBLE` |
| Cualquier otro dato | — | — | — | — | `NO_COINCIDE` |

El código al celular se lee en Redis del clon (`dev:otp:*`, envío simulado de la 002). Usa un celular
ficticio como `987000001`.

## Escenario 1: identidad en línea (historia 1, FR-001 a FR-007)

1. `POST $API/identidad/verificar` con el titular de prueba 1 y el celular: 200 con `desafioId` y
   `celularEnmascarado = 9*****001`.
2. Con fecha de emisión equivocada: 422 con un mensaje que no dice qué dato falló; no se envía código.
3. Con el DNI `49999999`: 503 que sugiere mesa de partes.
4. `POST $API/identidad/verificar-otp` con el código de Redis: 200 con `token` y `expiraEn = 900`.
5. Seis verificaciones fallidas seguidas con el mismo documento: la 6.ª responde 429 con `Retry-After`.

## Escenario 2: presentar en línea (historia 1, FR-008 a FR-022)

1. Con el `tokenIdentidad`, subir un PDF real a `POST $API/documentos` por cada requisito obligatorio
   de `LIC-02`: 201 con `documentoId` y `sha256`.
2. Subir un archivo de texto renombrado a `.pdf`: 415. Subir uno de 11 MB: 413.
3. `POST $API/expedientes` con `Idempotency-Key` nueva, `codigoReceta = LIC-02`, la misma identidad,
   los datos del establecimiento y los documentos: 201 con `numero = EXP-2026-NNNNNN`, `ruta = A`,
   `estado = REGISTRADO` y `canal = EN_LINEA`.
4. Repetir el mismo POST con la misma clave: 200 con el **mismo** número.
5. Otra clave con el mismo token: 409 (el permiso ya se usó).
6. Sin el documento de un requisito obligatorio (con otra identidad confirmada): 422 que señala ese
   requisito.
7. En la base del clon: `receta_al_presentar` guarda la tasa `177.10` y los requisitos; hay una fila
   en `historial_estado` (REGISTRADO), una en `auditoria` (`PRESENTAR_EN_LINEA`) y un evento
   `SolicitudPresentada` en `comun.evento_pendiente`; los datos personales están cifrados.

## Escenario 3: consulta pública (historia 2, FR-029 a FR-033)

1. `POST $API/expedientes/consultar` con el número del escenario 2 y `40000001`: 200 con
   `estado = REGISTRADO`, la descripción en lenguaje sencillo y el historial; sin documento, RUC,
   celular ni dirección.
2. Lo mismo con el RUC `10400000011`: 200.
3. Con un DNI ajeno y con un número inexistente: 404 con el **mismo** cuerpo.
4. Cinco consultas fallidas desde la misma conexión: la 6.ª (aunque sea correcta) responde 429.

## Escenario 4: mesa de partes y bandeja (historias 3 y 4)

1. Con el token del usuario MESA_PARTES: subir los documentos y `POST $API/expedientes` con la
   identidad del titular extranjero de prueba (sin código): 201 con `canal = MESA_PARTES`; en la base,
   `registrado_por` es ese usuario y la auditoría dice `REGISTRAR_PRESENCIAL`.
2. Con un usuario CAJA: 403 al registrar y al abrir la bandeja.
3. Con el usuario EVALUADOR: `GET $API/expedientes?estado=REGISTRADO&ruta=A` lista el expediente del
   escenario 2; `GET $API/expedientes/<número>` muestra el documento enmascarado y registra
   `VER_DETALLE`; el documento se descarga con `Content-Disposition: attachment`.

## Escenario 5: portal en el celular (EQ-05, SC-001, SC-009 y SC-010)

1. A 360 px y sin ayuda: desde la ficha de `LIC-02` (`Presentar solicitud`), confirmar la identidad,
   llenar el formulario, subir los documentos y presentar. Medir el tiempo: 15 minutos o menos.
2. Imprimir el comprobante; consultar el estado en `/consulta`.
3. Como MESA_PARTES, registrar una solicitud presencial con documentos ya digitalizados: 10 minutos o
   menos.
4. Lighthouse móvil en identidad, solicitud, comprobante y consulta: accesibilidad ≥ 90 y buenas
   prácticas ≥ 90, sin desplazamiento horizontal a 360 px.

## Escenario 6: carga de la consulta (EQ-01, SC-002)

```bash
docker run --rm -i -e BASE=http://host.docker.internal:<puerto>/api/v1 -e USUARIOS=100 -e DURACION=2m \
  grafana/k6:0.54.0 run - < tests/carga/eq01-consulta.js
```

Con expedientes de prueba sembrados y consultas correctas (no deben chocar con el límite de
intentos). Repetir con `USUARIOS=1000`. Umbrales: p95 < 2 s y errores < 1 %.

## Escenario 7: puertas de CI y privacidad (SC-005)

`npm run build`, `lint`, `formato`, `test:unit`, `test:integracion` (PostgreSQL temporal en 5433 y
Redis aislado), `cobertura` (≥ 80 % en `tramites/dominio` y `tramites/aplicacion`),
`regla-dependencia` y `contrato` en verde. La prueba de privacidad revisa que ningún registro de la
aplicación contenga los documentos, RUC, celulares, correos ni direcciones de los datos de prueba.
