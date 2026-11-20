# Guía de validación: evaluación, esquela y pago

## Requisitos previos

- Un clon aislado (su propio nombre de proyecto de Compose y puertos) o las pruebas de integración con
  PostgreSQL temporal en 5433 y Redis en 16379. Nunca el stack principal.
- Usuarios ficticios con roles EVALUADOR, CAJA, JEFATURA y MESA_PARTES, y expedientes de la 004
  (sembrados o presentados con los datos ficticios de su quickstart).

## Escenario 1: evaluación y esquela (historia 1)

1. EVALUADOR: `POST $API/expedientes/<n>/evaluacion` con `If-Match` = versión → 200 EN_EVALUACION.
2. `POST …/riesgo` sin cuerpo de licencia → 200 PENDIENTE_PAGO; en unos segundos existe
   `ESQ-<n>` con la tasa de la licencia.
3. Repetir el `POST …/riesgo` → 409 (o 412 con la versión vieja); sigue habiendo una sola esquela.
4. Otro expediente: corregir a una licencia del mismo grupo → toma la licencia, la ruta y la tasa
   nuevas. A una de otro grupo → 422.
5. Expediente de bodega (LIC-09) → PAGADO sin esquela.
6. Observar → OBSERVADO; observar otra vez (tras subsanar) → 409. Denegar → DENEGADO y nada más lo
   mueve.

## Escenario 2: pago en caja (historia 2)

1. CAJA: `GET $API/esquelas/<código>` y `GET $API/expedientes/<n>/titular` → datos para confirmar.
2. `POST …/pago` con un recibo → 201; en 30 segundos el expediente está PAGADO.
3. 10 pagos en paralelo de la misma esquela → un 201 y nueve 409. Recibo repetido en otra esquela →
   409.

## Escenario 3: esquela en la consulta (historia 3)

`POST $API/expedientes/consultar` de un expediente PENDIENTE_PAGO → `codigoEsquela`, `montoEsquela` y
`tokenConsulta`; con ese token, `GET $API/esquelas/<código>/pdf` → 200 `application/pdf` sin el
documento ni la dirección del titular.

## Escenario 4: subsanar (historia 4)

Expediente OBSERVADO: confirmar la identidad del titular (004), subir un PDF y `POST …/subsanar` con la
identidad y el documento → EN_EVALUACION. Con otra identidad → 403.

## Escenario 5: aprobar, corregir y auditar (historias 5 y 6)

EVALUADOR aprueba el expediente PAGADO de ruta A → APROBADO. JEFATURA corrige el recibo con motivo →
200 y `CORREGIR_RECIBO` en `GET $API/pagos/auditoria`; sin motivo → 422. `GET …/auditoria` del
expediente lista las decisiones con el usuario.

## Escenario 6: puertas de CI

`npm run build`, `lint`, `formato`, `test:unit`, `test:integracion`, `cobertura` (≥ 80 % en
`tramites` y `pagos`, `dominio` y `aplicacion`), `regla-dependencia` y `contrato` en verde; gitleaks
sin hallazgos.
