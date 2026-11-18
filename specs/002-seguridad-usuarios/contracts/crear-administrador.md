# Contrato: comando `crear-administrador`

Paso de instalación que crea el primer administrador (historia 3, FR-023, FR-024; research §R-12).

## Invocación

```bash
# Local (fuera de Docker), con DATABASE_URL y las claves de .env.example
npm run crear-administrador -w apps/api

# Con el sistema levantado por Docker Compose
docker compose -f infra/docker-compose.yml exec api npm run crear-administrador
```

## Entradas

| Variable de entorno | Si falta y hay terminal interactiva | Validación |
|---|---|---|
| `ADMIN_CORREO` | Pregunta "Correo:" | Formato de correo |
| `ADMIN_NOMBRE` | Pregunta "Nombre completo:" | 3 a 150 caracteres |
| `ADMIN_CELULAR` | Pregunta "Celular (9 dígitos):" | `^9[0-9]{8}$` |
| `ADMIN_CLAVE` | Pregunta "Clave:" **sin eco** y la pide dos veces | Política de clave (FR-022a) |

Sin terminal interactiva y con variables faltantes → termina con código 2 y el mensaje "Faltan
variables: ADMIN_…" (nombra las variables, nunca valores).

## Salidas

| Caso | Salida estándar | Código de salida |
|---|---|---|
| No hay administradores activos | `Administrador creado. Id: <uuid>. Deberá cambiar la clave en su primer ingreso.` | 0 |
| Ya existe un administrador activo | `Ya existe un administrador activo; no se hizo ningún cambio.` | 0 |
| Correo ya usado por otro usuario (no administrador) | `El correo ya está en uso.` | 1 |
| Datos inválidos | `Datos inválidos: <campos>` (sin valores) | 2 |
| Base de datos no disponible | `No se pudo conectar con la base de datos.` | 3 |

Nunca imprime ni registra el correo, el celular ni la clave. Es idempotente: ejecutarlo dos veces no
crea un segundo administrador.

## Prueba

Integración: base migrada sin usuarios → el comando (invocado como función con las variables de
entorno) crea un usuario activo con `ADMINISTRADOR` vigente y `debe_cambiar_clave = true`, que puede
iniciar sesión con el OTP simulado; una segunda ejecución no cambia el número de usuarios ni de
asignaciones.
