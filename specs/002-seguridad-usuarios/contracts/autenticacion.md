# Contrato: inicio de sesión, renovación y cierre

Comportamiento observable de las operaciones de `/auth`. Esquemas y códigos en
[openapi-cambios.md](./openapi-cambios.md); decisiones en [research.md](../research.md) §R-02 a §R-08.

## Flujo normal

```text
Portal                                   API
  │ POST /auth/iniciar-sesion {correo, clave}
  │──────────────────────────────────────▶│ límites → usuario por correo_hmac → argon2
  │◀─ 200 {desafioId, venceEn, celularEnmascarado} (SMS simulado: dev:otp:<usuarioId>)
  │ POST /auth/verificar-otp {desafioId, codigo}
  │──────────────────────────────────────▶│ límites → código → sesión nueva
  │◀─ 200 SesionPersonal + Set-Cookie refresh_personal
  │ … operaciones con Authorization: Bearer <accessToken> (15 min)
  │ POST /auth/renovar   (cookie)         │ máximo 8 h, ≤ 30 min sin renovar → rota
  │◀─ 200 SesionPersonal + Set-Cookie nueva
  │ POST /auth/cerrar-sesion (cookie)     │ revoca la sesión y marca seg:sesion-revocada:<sid>
  │◀─ 204 + Set-Cookie (borra)
```

## Tabla de decisiones de `iniciar-sesion`

El orden importa: el intento se **reserva de forma atómica antes** de comprobar las credenciales (el
6.º se rechaza aunque sea correcto, y con muchos intentos simultáneos como máximo 5 llegan a verificar
la clave). Si las credenciales resultan correctas, la reserva se libera.

| # | Condición | Respuesta | Efecto en contadores |
|---|---|---|---|
| 1 | Redis no responde | 503 `servicio-no-disponible` | — |
| 2 | Reserva del intento: `INCR` de `lim:fallos:correo` y `lim:fallos:ip` (atómico) da > 5 en alguno | 429 `demasiados-intentos`, `Retry-After` = mayor TTL restante; no se verifica la clave | el intento queda reservado |
| 3 | Correo inexistente, usuario inactivo o clave incorrecta | 401 `no-autenticado` (mismo cuerpo y tiempo similar: argon2 contra huella ficticia) | la reserva queda como fallo |
| 4 | Credenciales correctas (se libera el intento) y la reserva del envío (`INCR` de `lim:envios:usuario`) da > 3 | 429 `demasiados-intentos`, `Retry-After` | — |
| 5 | Credenciales correctas | 200 `DesafioOtp`; vence los códigos anteriores; envía el nuevo | intento liberado; envío reservado |
| 6 | Falla el envío del SMS | 503 `servicio-no-disponible` (el usuario puede reintentar) | se libera la reserva del envío |

## Tabla de decisiones de `verificar-otp`

| # | Condición | Respuesta | Efecto |
|---|---|---|---|
| 1 | Reserva del intento (correo del desafío e IP) da > 5 | 429; no se verifica el código | el intento queda reservado |
| 2 | `desafioId` inexistente, de otro propósito, vencido, usado o con 5 intentos | 401 | la reserva queda como fallo (correo e IP si el desafío existe; si no, solo IP) |
| 3 | Código incorrecto | 401 | `intentos+1`; la reserva queda como fallo |
| 4 | Usuario desactivado entre el paso 1 y el 2 | 401 | — |
| 5 | Código correcto | 200 `SesionPersonal` (`debeCambiarClave` según el usuario) + cookie | intento liberado; `usado_en = now`; sesión con `vence_maximo_en = now + 8 h` |

## `renovar`

| Condición | Respuesta |
|---|---|
| Sin cookie, formato inválido o sesión inexistente | 401 |
| Sesión revocada, `now ≥ vence_maximo_en` o `now − ultima_actividad_en > 30 min` | 401 (y borra la cookie) |
| Usuario inactivo | 401 |
| Hash = `refresh_hash` vigente | 200 + rotación + cookie nueva; `accessToken` con roles, `vs` y `dcc` actuales |
| Hash = `refresh_anterior_hash` y `rotada_en` hace ≤ 10 s | 401 (carrera entre pestañas; no revoca) |
| Hash = `refresh_anterior_hash` y `rotada_en` hace > 10 s | 401 + **revoca todas las sesiones del usuario** + evento `reutilizacion-refresh` |

## `cerrar-sesion`

- Siempre 204 y borra la cookie, aunque no haya cookie o la sesión ya esté revocada (idempotente).
- Si la sesión existía: `revocada_en = now` y, después del `COMMIT`, `SET seg:sesion-revocada:<sid> 1 EX 900`.
  Desde ese momento el token de acceso de esa sesión responde **401** en cualquier operación
  protegida (FR-004, FR-013), aunque no haya vencido.

## `cambiar-clave`

- Exige `bearerPersonal` válido; es la única operación de negocio permitida con `dcc = true`.
- `claveActual` incorrecta → 401 y cuenta como fallo (correo e IP); a los 5 fallos → 429.
- `claveNueva` que no cumple la política o igual a la actual → 422 con `errores` por regla, sin
  repetir la clave.
- Éxito → nueva huella, `debe_cambiar_clave = false`, `version_seguridad + 1`, revoca **las demás**
  sesiones del usuario, rota la cookie de la sesión actual y devuelve un `SesionPersonal` nuevo.

## Garantías transversales

- Ninguna respuesta, cabecera, URL ni línea de log contiene correo, celular, clave, código ni token
  (FR-029, SC-007). Los logs usan `usuarioId`/`sesionId` (research §R-17).
- Todas las respuestas de error usan `application/problem+json`.
- Los contadores son compartidos por todas las instancias (Redis, FR-009).
