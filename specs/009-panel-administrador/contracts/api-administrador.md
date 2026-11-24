# Contrato de la API: administrador (009)

Los `nullable: true` de este resumen se escriben en el contrato como `type: [<tipo>, 'null']`
(OpenAPI 3.1).

Resumen de lo que se agrega a `docs/06-contrato-api/openapi.yaml`. Todas las operaciones exigen
`bearerPersonal` con el rol **ADMINISTRADOR**: sin token 401 `no-autenticado`, otro rol 403
`sin-permiso`. Todas responden `Cache-Control: no-store`.

## `GET /admin/panel` → 200 `PanelAdministrador`

```yaml
PanelAdministrador:
  required: [usuarios, porRol, bloqueos, sesionesAbiertas, ingresosFallidos, ultimosEventos]
  properties:
    usuarios: { activos: integer, inactivos: integer }
    porRol: { MESA_PARTES, EVALUADOR, INSPECTOR, CAJA, JEFATURA, ADMINISTRADOR: integer }
    bloqueos:                       # null si el servicio de bloqueos no responde
      nullable: true
      properties: { cuentas: integer, origenes: integer }
    sesionesAbiertas: integer
    ingresosFallidos: { hoy: integer, ultimos7Dias: integer }
    ultimosEventos: { type: array, maxItems: 10, items: EventoAuditoriaSeguridad }
```

## `GET /admin/auditoria` → 200 `PaginaAuditoriaSeguridad` o `text/csv`

Parámetros de consulta (ninguno lleva datos personales):

| Nombre | Tipo | Regla |
| --- | --- | --- |
| `desde`, `hasta` | `date` | por defecto los últimos 30 días; rango ≤ 366 días; `desde ≤ hasta` |
| `accion` | `AccionAuditoriaSeguridad` | opcional |
| `actorId`, `afectadoId` | `uuid` | opcionales |
| `pagina` | entero ≥ 1 | por defecto 1 |
| `porPagina` | 1 a 100 | por defecto 20 |
| `formato` | `json` \| `csv` | por defecto `json`; en CSV se ignoran `pagina` y `porPagina` |

```yaml
EventoAuditoriaSeguridad:
  required: [id, ocurridoEn, accion, textoAccion, actor, afectado, objeto, resultado]
  properties:
    id: { type: string }            # bigint como texto
    ocurridoEn: { type: string, format: date-time }
    accion: AccionAuditoriaSeguridad   # enum de 21 valores
    textoAccion: { type: string }
    actor: { nullable: true, properties: { id: uuid, nombre: string } }
    afectado: { nullable: true, properties: { id: uuid, nombre: string } }
    objeto: { type: string, nullable: true }
    resultado: { enum: [EXITO, RECHAZADO] }
PaginaAuditoriaSeguridad: { pagina, porPagina, total, datos: EventoAuditoriaSeguridad[] }
```

CSV: UTF-8 con BOM, `;`, CRLF, columnas `fecha;accion;actor;afectado;objeto;resultado`, apóstrofo ante
`= + - @`. Máximo 10,000 filas. Cabeceras `X-Auditoria-Truncada: true|false` y `Content-Disposition:
attachment; filename="auditoria-seguridad-<AAAA-MM-DD>.csv"`.

Errores: 422 `NoProcesable` por fechas inválidas, rango invertido o mayor que 366 días, acción
desconocida o id no uuid.

## `GET /usuarios/{usuarioId}` → 200 `FichaUsuario`

```yaml
FichaUsuario:
  allOf: [Usuario]                  # el esquema actual (celular enmascarado)
  required: [ultimoIngreso, sesionesAbiertas, bloqueo, historialRoles, ultimosEventos]
  properties:
    ultimoIngreso: { type: string, format: date-time, nullable: true }
    sesionesAbiertas: integer
    bloqueo:                        # null si el servicio de bloqueos no responde
      nullable: true
      properties: { bloqueada: boolean, hasta: { type: string, format: date-time, nullable: true } }
    historialRoles:
      items:
        properties:
          rol: Rol
          asignadoPor: { id: uuid, nombre: string }
          asignadoEn: date-time
          retiradoPor: { nullable: true, ... }
          retiradoEn: { nullable: true, date-time }
    ultimosEventos: { maxItems: 10, items: EventoAuditoriaSeguridad }
```

404 si no existe o el id no es un uuid.

## `POST /usuarios/{usuarioId}/cerrar-sesiones` → 200 `{ sesionesCerradas: integer }`

Revoca todas las sesiones vigentes del usuario (las marca revocadas en PostgreSQL y en la caché de
seguridad). No lo desactiva. Registra `SESIONES_CERRADAS`. Errores: 404, 409 `accion-sobre-si-mismo`.

## `POST /usuarios/{usuarioId}/desbloquear` → 204

Borra el contador de intentos fallidos de la cuenta (no el del origen). Registra
`CUENTA_DESBLOQUEADA`, aunque no estuviera bloqueada. Errores: 404, 409 `accion-sobre-si-mismo`, 503
`servicio-no-disponible` si el servicio de bloqueos no responde.

## Cambios a operaciones existentes

- `PATCH /usuarios/{usuarioId}`, `PUT …/roles`, `POST …/clave-temporal`, `POST /usuarios`: sin cambio
  de forma; ahora registran su acción en la auditoría.
- `POST /auth/*`: sin cambio de forma; registran sus acciones.
- `PUT /admin/catalogo/recetas/{codigo}`, `POST /feriados`, `DELETE /feriados/{fecha}`: sin cambio de
  forma; publican su evento.

## Matriz de permisos (README del contrato)

| Operación | ADMIN | Otros 5 roles | Sin sesión |
| --- | --- | --- | --- |
| `GET /admin/panel` | 200 | 403 | 401 |
| `GET /admin/auditoria` | 200 | 403 | 401 |
| `GET /usuarios/{id}` | 200 | 403 | 401 |
| `POST /usuarios/{id}/cerrar-sesiones` | 200 | 403 | 401 |
| `POST /usuarios/{id}/desbloquear` | 204 | 403 | 401 |
