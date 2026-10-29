# Requisitos funcionales

## Orientación al administrado
| ID | Requisito funcional |
|---|---|
| RF01 | El sistema debe proponer el tipo de licencia mediante un asistente de tres preguntas basado en reglas. |
| RF02 | El sistema debe mostrar los requisitos, la tasa y el plazo de la licencia propuesta, leídos del catálogo. |
| RF03 | El sistema debe permitir consultar el estado del trámite con el número de expediente o con el DNI/RUC. |

## Solicitud digital
| ID | Requisito funcional |
|---|---|
| RF04 | El sistema debe mostrar un formulario dinámico que solicite solo los documentos de la licencia elegida, incluidos los documentos especiales según el giro. |
| RF05 | El sistema debe calcular automáticamente la tasa según el TUPA vigente. |
| RF06 | El sistema debe validar el DNI o RUC del solicitante con un servicio externo. |

## Evaluación e inspección
| ID | Requisito funcional |
|---|---|
| RF07 | El sistema debe asignar automáticamente la ruta del trámite (A, B o C) según el tipo de licencia. |
| RF08 | El sistema debe contar los plazos en días hábiles y alertar antes de su vencimiento. |
| RF09 | El sistema debe permitir al evaluador confirmar o corregir el nivel de riesgo y aprobar u observar el expediente. |
| RF10 | El sistema debe asignar el inspector y permitirle registrar el resultado de la ITSE con fotos desde su celular. |

## Pago en caja y emisión
| ID | Requisito funcional |
|---|---|
| RF11 | El sistema debe generar una esquela de pago con el número de expediente, el concepto, el monto de la tasa y un código único. |
| RF12 | El sistema debe permitir al personal de caja registrar el pago de una esquela con su código y el número de recibo. |
| RF13 | El sistema debe emitir la licencia digital con un código QR verificable públicamente. |
| RF14 | El sistema debe registrar el certificado ITSE con su fecha de vencimiento y avisar antes de que venza. |
| RF15 | El sistema debe gestionar los trámites conectados: transferencia, cambio de giro y duplicado. |

## Administración, seguridad y reportes
| ID | Requisito funcional |
|---|---|
| RF16 | El sistema debe autenticar al personal municipal con usuario, clave y código OTP. |
| RF17 | El sistema debe controlar permisos por rol: mesa de partes, evaluador, inspector, caja, jefatura y administrador. |
| RF18 | El sistema debe mostrar reportes de licencias vigentes, en trámite y con ITSE por vencer, por tipo, giro y zona. |
| RF19 | El sistema debe mostrar un tablero con tiempos de atención comparados con el plazo del TUPA, e ingresos registrados en caja. |
| RF20 | El sistema debe enviar notificaciones por correo y SMS en cada avance del trámite. |

## Relación entre historias de usuario y requisitos funcionales
| Historia de usuario | Requisitos relacionados |
|---|---|
| HU01 Asistente de ruta | RF01, RF02 |
| HU02 Formulario según licencia | RF04, RF06 |
| HU03 Cálculo de tasa | RF05 |
| HU04 Esquela de pago | RF11 |
| HU05 Consultar estado | RF03, RF20 |
| HU06 Licencia con QR | RF13 |
| HU07 Evaluar expediente | RF07, RF09 |
| HU08 Registrar ITSE desde el celular | RF10 |
| HU09 Alertas de plazos | RF08 |
| HU10 Tablero de jefatura | RF18, RF19 |
| HU11 Aviso de vencimiento ITSE | RF14, RF20 |
| HU12 Trámites conectados | RF15 |
| HU13 Registrar pago en caja | RF12 |

RF16 y RF17 provienen del atributo de seguridad (AC02) y de la Ley N.° 29733.