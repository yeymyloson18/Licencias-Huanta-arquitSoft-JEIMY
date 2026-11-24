# Contrato de la API: perfil propio (011)

Resumen de lo que se agrega o cambia en `docs/06-contrato-api/openapi.yaml`. **Este contrato se edita
primero** (principio II), antes de tocar el código, y después se regeneran los tipos de
`@licencias/contracts`.

## `GET /perfil` → 200 `PerfilPropio` (nuevo)

- `tags: [Seguridad]`, `operationId: obtenerMiPerfil`.
- `security: [{ bearerPersonal: [] }]`, **cualquier rol** (también un usuario sin roles).
- Sin parámetros de ruta, de consulta ni cuerpo. El usuario sale del token.
- Cabecera de respuesta `Cache-Control: no-store` (declarada en `headers`).

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| 200 | sesión válida con clave definitiva | `PerfilPropio` |
| 401 | sin token, token vencido, sesión cerrada o usuario desactivado | `problem+json` `no-autenticado` |
| 403 | la clave es temporal | `problem+json` `debe-cambiar-clave` |

```yaml
PerfilPropio:
  type: object
  additionalProperties: false
  required: [nombreCompleto, correo, celularEnmascarado, roles, ultimoIngreso, sesionesAbiertas]
  properties:
    nombreCompleto: { type: string }
    correo: { type: string, format: email }
    celularEnmascarado: { type: string, example: '9*****321', description: Nunca completo (FR-028). }
    roles:
      type: array
      uniqueItems: true
      items: { $ref: '#/components/schemas/Rol' }
    ultimoIngreso: { type: [string, 'null'], format: date-time }
    sesionesAbiertas: { type: integer, minimum: 0 }
```

## `POST /auth/cambiar-clave` (sin cambios de forma)

Solo cambian el `summary` y la `description`: "Cambia la clave del usuario autenticado: es
obligatorio cuando la clave es temporal (FR-022) y voluntario desde Mi perfil (011)". El cuerpo
`CambioClave`, las respuestas 200, 401, 422 y 429 y la auditoría `CLAVE_CAMBIADA` siguen iguales.

## Matriz de permisos (descripción del contrato y pruebas)

| Operación | Sin token | Clave temporal | Cualquier rol | Sin roles |
| --- | --- | --- | --- | --- |
| `GET /perfil` | 401 | 403 `debe-cambiar-clave` | 200 (propio) | 200 (propio) |
| `POST /auth/cambiar-clave` | 401 | 200 | 200 (propia) | 200 (propia) |

**Propiedad**: un `?usuarioId=…`, un `/perfil/<otro-id>` o un cuerpo con otro id no cambian nada.
La ruta con id no existe (404 de ruta) y los parámetros extra se ignoran. Siempre se devuelve el
perfil del token.

**Humo (Postman)**: se suma `GET /perfil` sin token → 401.
