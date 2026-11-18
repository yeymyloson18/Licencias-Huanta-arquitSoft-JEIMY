import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../dominio/rol';

export const METADATO_PERMITIR_CLAVE_TEMPORAL = 'seguridad:permitir-clave-temporal';
export const METADATO_ROLES = 'seguridad:roles';

/**
 * Marca las pocas operaciones de `/auth` que un usuario con clave temporal puede usar
 * (`cambiar-clave`). Es interno del módulo: no se exporta en la fachada (contracts/control-permisos.md).
 */
export const PermitirConClaveTemporal = (): MethodDecorator & ClassDecorator =>
  SetMetadata(METADATO_PERMITIR_CLAVE_TEMPORAL, true);

/** Roles admitidos por una operación; basta con tener uno (FR-014). Lo lee `RolesGuard`. */
export const Roles = (...roles: Rol[]): MethodDecorator & ClassDecorator =>
  SetMetadata(METADATO_ROLES, roles);
