// Fachada pública del módulo Seguridad: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").
// Contrato: specs/002-seguridad-usuarios/contracts/control-permisos.md. `PermitirConClaveTemporal`
// es interno del módulo y no se exporta.

export type { Rol } from './dominio/rol';
export { Roles } from './presentacion/decoradores';
export { JwtAuthGuard } from './presentacion/jwt-auth.guard';
export { RolesGuard } from './presentacion/roles.guard';
export {
  RequiereRoles,
  UsuarioActual,
  type UsuarioAutenticado,
} from './presentacion/control-permisos';
