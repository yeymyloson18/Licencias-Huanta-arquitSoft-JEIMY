// Fachada pública del módulo Seguridad: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").
// En US2 se agregan RequiereRoles, Roles, RolesGuard y UsuarioActual (contracts/control-permisos.md).

export type { Rol } from './dominio/rol';
export { JwtAuthGuard, type UsuarioAutenticado } from './presentacion/jwt-auth.guard';
