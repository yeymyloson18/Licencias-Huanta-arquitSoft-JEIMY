# Contrato: control de permisos reutilizable (fachada del módulo `seguridad`)

Interfaz que los demás módulos usan para proteger sus operaciones (FR-012, historia 2). Es la única
superficie del módulo `seguridad` que otros módulos pueden importar
(`apps/api/src/modulos/seguridad/fachada.ts`), lo que verifica la regla
`aislamiento-entre-modulos` de dependency-cruiser.

## Exportaciones de `fachada.ts`

| Exportación | Tipo | Uso |
|---|---|---|
| `Rol` | tipo (unión de los 6 códigos) | Declarar roles admitidos |
| `RequiereRoles(...roles: Rol[])` | decorador de método o clase | Protege la operación: exige sesión válida y al menos uno de los roles |
| `Roles(...roles)`, `JwtAuthGuard`, `RolesGuard` | decorador y guards | Para casos que necesiten combinarlos a mano |
| `UsuarioActual()` | decorador de parámetro | Entrega `{ usuarioId, roles }` del usuario autenticado (sin datos personales) |
| `UsuarioAutenticado` | tipo | Forma del objeto anterior |
| `FachadaSeguridad` | clase (inyectable) | Para otros módulos: `obtenerNombre(usuarioId)` (p. ej. para mostrar quién hizo una operación) |

`SeguridadModule` es `@Global()`: los guards resuelven sus dependencias sin que cada módulo importe
el interior de `seguridad`.

## Ejemplo de uso en otro módulo

```ts
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';

@Post('esquelas/:codigoEsquela/pago')
@RequiereRoles('CAJA')
registrarPago(@UsuarioActual() usuario: UsuarioAutenticado /* … */) { /* … */ }
```

## Comportamiento garantizado

| Situación | Respuesta | ¿Se ejecuta el controlador? |
|---|---|---|
| Sin `Authorization`, token mal formado, firma inválida o vencido | 401 `no-autenticado` | No |
| Token válido, versión de seguridad distinta y usuario inactivo | 401 `no-autenticado` | No |
| Token válido, `dcc = true` (clave temporal) | 403 `debe-cambiar-clave` | No |
| Token válido sin ninguno de los roles admitidos (roles actuales si la versión cambió) | 403 `sin-permiso` | No |
| Token válido con al menos un rol admitido | — | Sí |

- Ninguna respuesta 401/403 modifica datos (los guards corren antes del controlador) ni incluye
  información del usuario.
- Costo por petición: verificación de firma en memoria + una lectura en Redis; PostgreSQL solo si
  Redis no responde o si cambió la versión (research §R-07).

## Pruebas que lo verifican

- Unitarias de `RolesGuard` y de la decisión de `JwtAuthGuard` (con dobles del almacén de versiones).
- Integración con un controlador de prueba `@RequiereRoles('CAJA')`: 401 sin token, 403 con
  `EVALUADOR`, 200 con `CAJA`, 200 con `EVALUADOR + JEFATURA` en una operación que admite `JEFATURA`,
  401 tras desactivar al usuario y 403 tras quitarle el rol (historia 2, escenarios 1 a 5).
- Matriz de los endpoints de usuarios: 6 roles × 6 operaciones + sin token (SC-002).
