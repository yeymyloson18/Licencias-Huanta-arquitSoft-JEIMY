# Cambios al contrato `docs/06-contrato-api/openapi.yaml`

Se hacen **antes** del código (principio II) y se validan con `npm run contrato`.

## Operaciones

| Operación | Cambio |
| --- | --- |
| **Nueva** `POST /expedientes/{numeroExpediente}/evaluacion` (`iniciarEvaluacion`) | Rol EVALUADOR, `If-Match`. REGISTRADO → EN_EVALUACION. 200 `Expediente`; 401, 403, 404, 409, 412 |
| `POST /expedientes/{n}/riesgo` (`confirmarNivelRiesgo`) | Cuerpo: `codigoReceta` opcional (en lugar de `nivelRiesgo`; research §R-04) y `comentario`. Descripción: pasa a PENDIENTE_PAGO y solicita la esquela; con tasa 0.00, pasa a PAGADO sin esquela. 422 si la licencia no es del mismo grupo o no está vigente |
| `POST /expedientes/{n}/aprobar` (`aprobarEvaluacion`) | Descripción: aprueba un expediente PAGADO de ruta A o C y lo deja APROBADO (la ruta B es de la 006) |
| `POST /expedientes/{n}/observar` (`observarExpediente`) | `plazoSubsanarEn` deja de ser obligatorio (plazos en la 006); `descripcion` de 10 a 1,000 caracteres; 409 si ya se observó una vez |
| `POST /expedientes/{n}/denegar` (`denegarExpediente`) | `motivo` de 10 a 1,000 caracteres |
| `POST /expedientes/{n}/subsanar` (`subsanarObservacion`) | Cuerpo: `identidad` (obligatoria con `tokenIdentidad`) y `documentos`; respuesta: vuelve a **EN_EVALUACION**; agrega 404 y 422 |
| `GET /expedientes/{n}/auditoria` (`auditoriaTramites`) | Agrega 404; los registros llevan `nombreUsuario` y `referencia` = número de expediente |
| `GET /expedientes/{n}/titular` (`obtenerTitularParaCaja`) | Sin cambios (rol CAJA); agrega `Cache-Control: no-store` |
| `POST /expedientes/consultar` (`consultarEstado`) | `EstadoPublico` llena `codigoEsquela`, `montoEsquela`, `esquelaPagada` y `tokenConsulta` cuando el expediente está PENDIENTE_PAGO, y `observacionesPendientes` y `requisitosSubsanables` (id y descripción de la receta guardada, agregado al implementar la historia 4) cuando está OBSERVADO |
| `GET /esquelas/{codigo}` (`consultarEsquela`) | Rol CAJA; agrega `estadoExpediente` y `nombreLicencia` al esquema `Esquela` |
| `GET /esquelas/{codigo}/pdf` (`descargarEsquela`) | `tokenConsulta` del mismo expediente o sesión EVALUADOR, CAJA o JEFATURA; agrega 403; 202 mientras la esquela aún no existe |
| `POST /esquelas/{codigo}/pago` (`registrarPagoEnCaja`) | Agrega 422 (recibo con formato inválido); 409 con `type` `esquela-ya-pagada`, `recibo-repetido` o `transicion-invalida` |
| `PATCH /esquelas/{codigo}/recibo` (`corregirNumeroRecibo`) | Agrega 422 (sin motivo o recibo inválido); 409 si no está pagada o el recibo ya existe |
| `GET /pagos/auditoria` (`auditoriaPagos`) | Agrega 422 (fechas inválidas); orden del más reciente al más antiguo; `porPagina` hasta 50 |

## Permisos

| Operación | Sin sesión | EVALUADOR | CAJA | JEFATURA | Otros roles |
| --- | --- | --- | --- | --- | --- |
| evaluacion, riesgo, observar, denegar, aprobar | 401 | ✅ | 403 | 403 | 403 |
| subsanar | 401 | 403 | 403 | 403 | MESA_PARTES ✅ (o `tokenIdentidad`) |
| auditoria del expediente, `GET /pagos/auditoria`, `PATCH …/recibo` | 401 | 403 | 403 | ✅ | 403 |
| `GET /esquelas/{codigo}`, `POST …/pago` | 401 | 403 | ✅ | 403 | 403 |
| `GET …/titular` (como ya decía la matriz del contrato) | 401 | 403 | ✅ | ✅ | 403 |
| `GET …/pdf` | 401 (sin `tokenConsulta`) | ✅ | ✅ | ✅ | 403 |

## Errores con `type` propio

`transicion-invalida` (409, la acción no corresponde al estado; el `title` nombra el estado),
`ya-observado` (409), `esquela-ya-pagada` (409), `recibo-repetido` (409), `version-cambiada` (412).
