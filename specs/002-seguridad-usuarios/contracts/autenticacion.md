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
  │ POST /auth/cerrar-sesion (cookie)     │ revoca la sesión
  │◀─ 204 + Set-Cookie (borra)
```

## Tabla de decisiones de `iniciar-sesion`

El orden importa: los límites se comprueban **antes** que las credenciales (el 6.º intento se rechaza
aunque sea correcto).

| # | Condición | Respuesta | Efecto en contadores |
|---|---|---|---|
| 1 | Redis no responde | 503 `servicio-no-disponible` | — |
| 2 | `lim:fallos:correo` ≥ 5 o `lim:fallos:ip` ≥ 5 | 429 `demasiados-intentos`, `Retry-After` = mayor TTL restante | — |
| 3 | Correo inexistente, usuario inactivo o clave incorrecta | 401 `no-autenticado` (mismo cuerpo y tiempo similar: argon2 contra huella ficticia) | +1 correo, +1 IP |
| 4 | Credenciales correctas y `lim:envios:usuario` ≥ 3 | 429 `demasiados-intentos`, `Retry-After` | — |
| 5 | Credenciales correctas | 200 `DesafioOtp`; vence los códigos anteriores; envía el nuevo | +1 envíos |
| 6 | Falla el envío del SMS | 503 `servicio-no-disponible` (el usuario puede reintentar) | el envío no cuenta |

## Tabla de decisiones de `verificar-otp`

| # | Condición | Respuesta | Efecto |
|---|---|---|---|
| 1 | Límites superados para el correo del desafío o la IP | 429 | — |
| 2 | `desafioId` inexistente, de otro propósito, vencido, usado o con 5 intentos | 401 | +1 fallos (correo e IP) si el desafío existe; si no, solo IP |
| 3 | Código incorrecto | 401 | `intentos+1`; +1 correo, +1 IP |
| 4 | Usuario desactivado entre el paso 1 y el 2 | 401 | — |
| 5 | Código correcto | 200 `SesionPersonal` (`debeCambiarClave` según el usuario) + cookie | `usado_en = now`; sesión con `vence_maximo_en = now + 8 h` |

## `renovar`

| Condición | Respuesta |
|---|---|
| Sin cookie, formato inválido o sesión inexistente | 401 |
| Sesión revocada, `now ≥ vence_maximo_en` o `now − ultima_actividad_en > 30 min` | 401 (y borra la cookie) |
| Usuario inactivo | 401 |
| Hash = `refresh_hash` vigente | 200 + rotación + cookie nueva; `accessToken` con roles, `vs` y `dcc` actuales |
| Hash = `refresh_anterior_hash` y `rotada_en` hace ≤ 10 s | 401 (carrera entre pestañas; no revoca) |
| Hash = `refresh_anterior_hash` y `rotada_en` hace > 10 s | 401 + **revoca todas las sesiones del usuario** + evento `reutilizacion-refresh` |

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
