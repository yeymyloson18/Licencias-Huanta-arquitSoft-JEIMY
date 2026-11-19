# Contrato de la API REST

El contrato completo está en [`openapi.yaml`](openapi.yaml) (OpenAPI 3.1): **51 operaciones en 47 rutas**, agrupadas
por los 9 módulos del monolito. Es la fuente única de verdad entre el Portal Web y el Backend (RC08):

- El backend NestJS valida cada petición y respuesta contra este archivo (pruebas de contrato, criterio 5).
- El frontend genera su cliente TypeScript a partir de él, así los nombres y tipos nunca se desalinean.
- Swagger UI lo publica en `/api/docs` en el entorno de desarrollo.

Para verlo ahora mismo: abre [editor.swagger.io](https://editor.swagger.io) y pega el contenido de `openapi.yaml`.

## Convenciones

| Tema | Regla | Motivo |
|---|---|---|
| Versión | Prefijo `/api/v1` | Cambios incompatibles irán en `/api/v2` sin romper el Portal. |
| Nombres | Recursos en español y plural (`/expedientes`); acciones del dominio como subrecurso con POST (`/expedientes/{n}/aprobar`) | Las decisiones del evaluador son eventos del negocio, no simples ediciones. |
| Datos personales | DNI/RUC, celular y dirección viajan solo en el cuerpo de un POST, nunca en la URL; las búsquedas por nombre o correo también usan POST con cuerpo (`POST /usuarios/busqueda`) | Las URL quedan en logs y en el historial del navegador (Ley N.° 29733). |
| Errores | `application/problem+json` (RFC 9457), sin datos personales | EQ-04. |
| Consulta fallida | Responde 404 sin decir si falló el número o el documento | Evita adivinar expedientes (EQ-04). |
| Límite de intentos | 5 fallos en 15 minutos → 429 con `Retry-After` | ADR-007. |
| Concurrencia | Las decisiones del evaluador exigen `If-Match` con la versión del expediente → 412 si cambió | Dos evaluadores no se pisan. |
| Reintentos seguros | `Idempotency-Key` al presentar solicitud y al registrar pago | Si la red falla, no se crea un expediente ni un pago duplicado. |
| Montos | Texto con 2 decimales (`"159.50"`) | Evita errores de redondeo de los decimales binarios. |
| Caché del catálogo | Las respuestas públicas del catálogo y del asistente llevan `Cache-Control: public, max-age=60` y Redis las guarda 240 s; al guardar una receta se borran sus claves. Las de administración, la propuesta del asistente y el 404 de una receta llevan `no-store` | Un cambio del TUPA se ve en la siguiente consulta y, aunque falle el borrado, en 5 minutos como máximo (FR-024 de la 003, EQ-06). |
| Asistente de ruta | `POST /asistente/proponer` responde 200 con `resultado: PROPUESTA` (y la receta) o `resultado: NO_DETERMINADA` (y el `motivo`: `SIN_REGLA` o `RECETA_NO_DISPONIBLE`); 422 solo para respuestas inválidas | "No se pudo determinar" es un resultado válido del negocio, no un error (FR-006 de la 003). |
| Archivos | Se suben primero a `POST /documentos` y la solicitud lleva los ids | La solicitud queda liviana y los archivos se validan uno por uno. |

## Tres tipos de token

| Token | Quién lo obtiene | Cómo | Duración | Qué permite |
|---|---|---|---|---|
| `bearerPersonal` | Personal municipal | Correo + clave + OTP por SMS (RF16) | 15 min, renovable | Lo que permiten sus roles (RF17) |
| `tokenIdentidad` | Administrado que presenta en línea | DNI/RUC validado + OTP al celular (RF06) | 15 min | Subir documentos, presentar y subsanar **su** solicitud |
| `tokenConsulta` | Administrado que consulta | Número de expediente + DNI/RUC (RF03) | 15 min | Leer **ese** expediente y descargar su esquela o licencia |

**Renovación del personal (cookie `refresh_personal`).** El token de acceso del personal se renueva con
un refresh token opaco que **no viaja en el cuerpo**: va en la cookie `refresh_personal`
(`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`), así un ataque XSS no puede robarlo. Cada
renovación la rota; reutilizar una cookie ya rotada cierra todas las sesiones del usuario. La sesión
dura como máximo 8 horas y se cierra tras 30 minutos sin renovar. Al cerrar sesión, el token de acceso
de esa sesión deja de servir al instante. El portal guarda el token de acceso solo en memoria.

### Tipos de problema

Los errores usan `application/problem+json`; el campo `type` es `https://licencias.example.pe/errores/<sufijo>`:

| Sufijo | Estado | Cuándo |
|---|---|---|
| `no-autenticado` | 401 | Sin sesión válida o credenciales incorrectas (mismo mensaje para correo, clave o código) |
| `sin-permiso` | 403 | Ningún rol admitido |
| `debe-cambiar-clave` | 403 | El usuario tiene una clave temporal pendiente de cambio |
| `demasiados-intentos` | 429 | 5 fallos o 3 códigos en 15 minutos; incluye `Retry-After` |
| `ultimo-administrador` | 409 | La operación dejaría al sistema sin administradores activos |
| `correo-en-uso` | 409 | El correo ya pertenece a otro usuario |
| `validacion` | 422 | Datos inválidos; `errores[]` por campo, sin repetir el valor |
| `servicio-no-disponible` | 503 | El inicio de sesión no puede comprobar los límites o enviar el código |

## Matriz de permisos por rol (propuesta para EQ-04)

Cada celda marcada es una prueba automática que debe responder 2xx; cada celda vacía, una prueba que debe responder 403.

| Operación | Mesa de partes | Evaluador | Inspector | Caja | Jefatura | Admin. | Público / token del administrado |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Ver catálogo, usar asistente, verificar QR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editar recetas del catálogo (RF21) | | | | | | ✓ | |
| Gestionar usuarios y roles (RF22) | | | | | | ✓ | |
| Registrar y eliminar feriados (RF23) | | | | | | ✓ | |
| Presentar solicitud y subir documentos | ✓ | | | | | | tokenIdentidad |
| Subsanar observación | ✓ | | | | | | tokenIdentidad |
| Consultar estado con expediente + DNI/RUC | | | | | | | ✓ |
| Listar y ver expedientes | ✓ | ✓ | | | ✓ | | |
| Confirmar riesgo, aprobar, observar, denegar (RF09) | | ✓ | | | | | |
| Ver titular del expediente | | | | ✓ | ✓ | | |
| Consultar esquela y registrar pago (RF12) | | | | ✓ | | | |
| Descargar esquela | ✓ | | | ✓ | ✓ | | tokenConsulta |
| Corregir número de recibo (RF24) | | | | | ✓ | | |
| Asignar inspector (RF10) | | | | | ✓ | | |
| Ver inspecciones | | | solo las suyas | | ✓ | | |
| Registrar resultado ITSE (RF10) | | | solo el asignado | | | | |
| Descargar licencia | ✓ | ✓ | | | ✓ | | tokenConsulta |
| Alertas de plazos, tablero, reportes y auditoría (RF08, RF18, RF19, RF25) | | | | | ✓ | | |

Pendiente: aprobar esta matriz con la Municipalidad (estado del escenario EQ-04).

## Operaciones por módulo

| Módulo | Operaciones |
|---|---|
| Seguridad y Usuarios | `iniciarSesion`, `verificarOtpPersonal`, `renovarSesion`, `cerrarSesion`, `verificarIdentidadAdministrado`, `verificarOtpAdministrado`, `cambiarClave`, `listarUsuarios`, `buscarUsuarios`, `crearUsuario`, `actualizarUsuario`, `asignarRoles`, `asignarClaveTemporal` |
| Catálogo y Asistente | `listarRecetas`, `obtenerReceta`, `actualizarReceta`, `listarRecetasAdmin`, `obtenerRecetaAdmin`, `obtenerPreguntasAsistente`, `proponerLicencia` |
| Trámites | `subirDocumento`, `presentarSolicitud`, `listarExpedientes`, `consultarEstado`, `obtenerExpediente`, `obtenerTitularParaCaja`, `confirmarNivelRiesgo`, `aprobarEvaluacion`, `observarExpediente`, `denegarExpediente`, `subsanarObservacion`, `auditoriaTramites`, `descargarDocumento` |
| Pagos en caja | `consultarEsquela`, `descargarEsquela`, `registrarPagoEnCaja`, `corregirNumeroRecibo`, `auditoriaPagos` |
| Inspecciones | `listarInspecciones`, `asignarInspector`, `registrarResultadoItse` |
| Licencias | `verificarLicenciaPublica`, `obtenerLicencia`, `descargarLicencia` |
| Reloj de plazos | `listarFeriados`, `registrarFeriado`, `eliminarFeriado`, `listarAlertas` |
| Reportes | `obtenerTablero`, `reporteLicencias` |
| Operación | `salud` (chequeo para Nginx y Uptime Kuma) |

Notificaciones no expone endpoints: reacciona a eventos y los workers envían los mensajes.

## APIs externas que consume el backend

| Servicio | Uso | Contrato interno (puerto) | Si no responde |
|---|---|---|---|
| Validación DNI/RUC | Confirmar identidad antes de presentar en línea (RF06) | `ValidadorIdentidad` | Responde 503 y el administrado puede ir a mesa de partes (RC12) |
| Correo y SMS | OTP (directo) y avisos del trámite (por cola) | `EnviadorOTP`, `Notificador` | Los avisos se reintentan desde la cola; el OTP muestra error y permite reenviar |
| WhatsApp Business API | Chatbot (Fase 2) | Será otro adaptador de entrada sobre esta misma API | — |

Mientras no haya proveedor contratado, cada puerto tiene un adaptador simulado, y el cambio al real no toca los casos de uso (ADR-003).
