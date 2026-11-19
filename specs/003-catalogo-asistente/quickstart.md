# Guía de validación: Catálogo y Asistente de ruta

Comprueba la funcionalidad 003 de punta a punta. Usa siempre datos ficticios. **No uses el
administrador del stack principal.** Valida en un stack aislado o con un PostgreSQL temporal, igual
que en la 002 (ver la memoria del proyecto sobre el puerto 5432).

## Requisitos previos

- Docker y Node.js 24. Parte del stack levantado con el comando único de la 001, en un clon o con un
  nombre de proyecto de Compose propio.
- Un administrador de prueba creado con `npm run crear-administrador` (README, funcionalidad 002), y
  su token de acceso tras iniciar sesión con OTP (el código simulado se lee en Redis).
- Variables: `API=http://localhost:<puerto>/api/v1` y `TOKEN=<token de acceso>`.

## Escenario 1: asistente sin sesión (historia 1, SC-002)

1. `curl -s $API/asistente/preguntas`: 3 preguntas. `NIVEL_RIESGO` tiene 5 opciones, entre ellas
   `NO_SE`.
2. `POST $API/asistente/proponer` con `{"respuestas":{"TIPO_ESTABLECIMIENTO":"OTRO","ES_CESIONARIO":"NO","NIVEL_RIESGO":"MEDIO"}}`:
   responde 200, `resultado=PROPUESTA` y `receta.codigo=LIC-02`, `tasa=177.10`.
3. Lo mismo con `NIVEL_RIESGO=NO_SE`: responde 200 con `NO_DETERMINADA / SIN_REGLA`.
4. Lo mismo con `TIPO_ESTABLECIMIENTO=BODEGA`: responde `LIC-09` con `tasa=0.00`.
5. Sin `NIVEL_RIESGO`, o con `NIVEL_RIESGO=ENORME`: responde 422 con
   `errores[0].campo=respuestas.NIVEL_RIESGO`.
6. Todas las combinaciones: `npm run test:unit -- motor-reglas-asistente` hace pasar las 30 filas.

## Escenario 2: ficha pública (historia 2, SC-003)

1. `curl -si $API/catalogo/recetas/LIC-03`: responde 200 con `Cache-Control: public, max-age=60`,
   `tasa=305.90`, `calificacion=EVALUACION_PREVIA_SILENCIO_POSITIVO`, `ordenItse=PREVIA` y los
   requisitos en orden.
2. Compara las 12 fichas con `docs/01-analisis-de-sistema/09-validacion-del-tupa.md`. También lo
   cubre la prueba de integración del catálogo.
3. En el portal, `/licencias/LIC-09` muestra "Gratuito" y "Provisional de 12 meses".

## Escenario 3: edición, registro y propagación (historia 3, SC-005 y SC-006)

1. `GET $API/admin/catalogo/recetas` sin token responde 401. Con un usuario CAJA responde 403. Con
   `$TOKEN` responde 200 con 12 recetas.
2. `PUT $API/catalogo/recetas/LIC-02` con `{"tasa":"180.00"}` y `$TOKEN`: responde 200 con
   `tasa=180.00`.
3. Al instante, `GET $API/catalogo/recetas/LIC-02` y la propuesta del escenario 1 paso 2 muestran
   `180.00`. La caché se invalidó.
4. En la base, la última fila de `catalogo.cambio_receta` es de `LIC-02`, tiene `usuario_id` igual
   al del administrador y `cambios = {"tasa":{"antes":"177.10","despues":"180.00"}}`.
5. Vuelve a enviar el mismo PUT: responde 200 y **no** se agrega ninguna fila.
6. `PUT` con `{"tasa":"-1.00","requisitos":[]}`: responde 422 con un error en `tasa` y otro en
   `requisitos`. La receta y el registro no cambian.
7. `PUT LIC-01` con `{"calificacion":"EVALUACION_PREVIA_SILENCIO_POSITIVO"}`: responde 422 en
   `calificacion` (coherencia con la ruta A).
8. Reordena los requisitos de `LIC-01` (el 3 al primer lugar, con los mismos `id`): la ficha muestra
   el orden nuevo y los `id` no cambian.
9. **Peor caso de propagación:** detén Redis, guarda un cambio, vuelve a levantar Redis. El valor
   nuevo se ve en 300 s como máximo, y la prueba de integración lo simula. Arrancar la API con
   `CATALOGO_CACHE_TTL_SEGUNDOS=300` falla con un mensaje que nombra la variable.
10. Deja la tasa en `177.10` al terminar.

## Escenario 4: desactivar y reactivar (historia 4, SC-009)

1. `PUT LIC-06` con `{"activa":false}`. Después:
   - `LIC-06` no aparece en `GET /catalogo/recetas`;
   - `GET /catalogo/recetas/LIC-06` responde 404;
   - `OTRO` + `SI` + `MEDIO` en el asistente da `NO_DETERMINADA / RECETA_NO_DISPONIBLE`;
   - `GET /admin/catalogo/recetas/LIC-06` responde 200 con `activa=false`.
2. `PUT LIC-06` con `{"activa":true}`: todo vuelve a la normalidad.

## Escenario 5: portal en el celular (EQ-05, SC-001, SC-007 y SC-008)

1. En `/asistente`, con un ancho de 360 px y sin sesión, responde las tres preguntas con el teclado.
   Comprueba que el foco va al título, que se anuncia el avance y que funcionan "Volver" y
   "Empezar de nuevo". Mide el tiempo: 3 minutos o menos.
2. Recarga a mitad del asistente: sigue en la misma pregunta.
3. Como administrador, en `/admin/catalogo/LIC-02` cambia la tasa y un requisito y guarda. Mide el
   tiempo: 3 minutos o menos. Comprueba que los errores aparecen junto a cada campo y que se ve el
   aviso de los 5 minutos.
4. Lighthouse móvil en `/asistente`, en la propuesta, en `/licencias/LIC-03` y en
   `/admin/catalogo/LIC-02` (con la cookie, como en la 002): accesibilidad ≥ 90 y buenas
   prácticas ≥ 90.

## Escenario 6: carga (EQ-01, SC-004)

```bash
docker run --rm -i -e BASE=http://host.docker.internal:<puerto>/api/v1 -e USUARIOS=100 -e DURACION=2m \
  grafana/k6:<versión fijada> run - < tests/carga/eq01-catalogo.js
```

Esta es la prueba de humo local. Los umbrales p95 < 2 s y errores < 1 % deben pasar. La medición con
1,000 usuarios se repite en el entorno desplegado y se anota en el README.

## Escenario 7: puertas de CI

`npm run build`, `lint`, `formato`, `test:unit`, `test:integracion` (con `DATABASE_URL` hacia un
PostgreSQL temporal), `cobertura` (≥ 80 % en `catalogo/dominio` y `catalogo/aplicacion`),
`regla-dependencia` y `contrato`: todo en verde. `esquema-equivalente` también compara los datos del
catálogo.
