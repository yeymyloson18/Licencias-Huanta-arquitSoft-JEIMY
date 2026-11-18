import { SetMetadata } from '@nestjs/common';

export const METADATO_PERMITIR_CLAVE_TEMPORAL = 'seguridad:permitir-clave-temporal';

/**
 * Marca las pocas operaciones de `/auth` que un usuario con clave temporal puede usar
 * (`cambiar-clave`). Es interno del módulo: no se exporta en la fachada (contracts/control-permisos.md).
 */
export const PermitirConClaveTemporal = (): MethodDecorator & ClassDecorator =>
  SetMetadata(METADATO_PERMITIR_CLAVE_TEMPORAL, true);
