# Requisitos funcionales

## Orientación al administrado
| ID | Requisito funcional |
|---|---|
| RF01 | El sistema debe proponer el tipo de licencia mediante un asistente de tres preguntas basado en reglas. |
| RF02 | El sistema debe mostrar los requisitos, la tasa y el plazo de la licencia propuesta, leídos del catálogo vigente. |
| RF03 | El sistema debe permitir consultar el estado del trámite con el número de expediente o con el DNI/RUC. |

## Solicitud digital
| ID | Requisito funcional |
|---|---|
| RF04 | El sistema debe mostrar un formulario dinámico que solicite solo los documentos de la licencia elegida, incluidos los documentos especiales según el giro. |
| RF05 | El sistema debe calcular automáticamente la tasa según la versión vigente del TUPA. |
| RF06 | El sistema debe validar el DNI o RUC del solicitante con servicios externos. |

## Evaluación e inspección
| ID | Requisito funcional |
|---|---|
| RF07 | El sistema debe asignar automáticamente la ruta del trámite (A, B o C) según la receta de la licencia. |
| RF08 | El sistema debe contar los plazos en días hábiles y alertar antes de su vencimiento. |
| RF09 | El sistema debe permitir al evaluador confirmar o corregir el nivel de riesgo y aprobar u observar el expediente. |
| RF10 | El sistema debe asignar el inspector y registrar el resultado de la ITSE con fotos, incluso sin conexión. |
| RF11 | El sistema debe registrar recursos de reconsideración y apelación en los trámites de evaluación previa. |

## Pagos y emisión
| ID | Requisito funcional |
|---|---|
| RF12 | El sistema debe procesar pagos digitales mediante una pasarela externa, además del pago en caja. |
| RF13 | El sistema debe evitar cobros dobles ante reintentos o fallas de conexión. |
| RF14 | El sistema debe emitir la licencia digital con un código QR verificable públicamente. |
| RF15 | El sistema debe registrar el certificado ITSE con su fecha de vencimiento y avisar antes de que venza. |
| RF16 | El sistema debe gestionar los trámites conectados: transferencia, cambio de giro y duplicado. |

## Administración, seguridad y reportes
| ID | Requisito funcional |
|---|---|
| RF17 | El sistema debe autenticar al personal municipal con usuario, clave y código OTP. |
| RF18 | El sistema debe controlar permisos por rol: mesa de partes, evaluador, inspector, jefatura y administrador. |
| RF19 | El sistema debe registrar cada acción en una bitácora de auditoría que no se pueda editar ni borrar. |
| RF20 | El sistema debe permitir al administrador funcional crear versiones del catálogo de licencias con fecha de vigencia. |
| RF21 | El sistema debe mostrar reportes de licencias vigentes, en trámite y con ITSE por vencer, por tipo, giro y zona. |
| RF22 | El sistema debe mostrar un tablero con tiempos reales de atención comparados con el plazo del TUPA, e ingresos por tasas. |
| RF23 | El sistema debe enviar notificaciones por correo y SMS en cada avance del trámite. |

## Relación entre historias de usuario y requisitos funcionales
| Historia de usuario | Requisitos relacionados |
|---|---|
| HU01 Asistente de ruta | RF01, RF02 |
| HU02 Formulario según licencia | RF04, RF06 |
| HU03 Cálculo de tasa | RF05 |
| HU04 Pago en línea | RF12, RF13 |
| HU05 Consultar estado | RF03, RF23 |
| HU06 Licencia con QR | RF14 |
| HU07 Evaluar expediente | RF07, RF09 |
| HU08 Registrar ITSE sin señal | RF10 |
| HU09 Alertas de plazos | RF08 |
| HU10 Tablero de jefatura | RF21, RF22 |
| HU11 Versionar el catálogo | RF20 |
| HU12 Aviso de vencimiento ITSE | RF15, RF23 |
| HU13 Trámites conectados | RF16 |
| HU14 Recursos | RF11 |