import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorProblema } from '../../../../../src/compartido/presentacion/error-problema';
import type { Rol } from '../../../../../src/modulos/seguridad/dominio/rol';
import { Roles } from '../../../../../src/modulos/seguridad/presentacion/decoradores';
import type { PeticionAutenticada } from '../../../../../src/modulos/seguridad/presentacion/jwt-auth.guard';
import { RolesGuard } from '../../../../../src/modulos/seguridad/presentacion/roles.guard';

class ControladorDePrueba {
  libre(): void {
    /* sin roles declarados */
  }

  @Roles('CAJA', 'JEFATURA')
  deCajaOJefatura(): void {
    /* admite dos roles */
  }
}

const contexto = (metodo: keyof ControladorDePrueba, roles: readonly Rol[] | null) =>
  ({
    getHandler: () => ControladorDePrueba.prototype[metodo],
    getClass: () => ControladorDePrueba,
    switchToHttp: () => ({
      getRequest: (): PeticionAutenticada => ({
        headers: {},
        sesionAutenticada:
          roles === null
            ? undefined
            : {
                usuarioId: 'u',
                sesionId: 's',
                roles,
                versionSeguridad: 1,
                debeCambiarClave: false,
              },
      }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('sin roles declarados permite', () => {
    expect(guard.canActivate(contexto('libre', ['EVALUADOR']))).toBe(true);
  });

  it('con al menos uno de los roles admitidos permite (FR-014)', () => {
    expect(guard.canActivate(contexto('deCajaOJefatura', ['EVALUADOR', 'JEFATURA']))).toBe(true);
  });

  it('sin ninguno de los roles admitidos responde 403 sin-permiso', () => {
    try {
      guard.canActivate(contexto('deCajaOJefatura', ['EVALUADOR']));
      throw new Error('debía fallar');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorProblema);
      expect((error as ErrorProblema).tipo).toBe('sin-permiso');
    }
  });

  it('sin usuario autenticado en la petición responde 401 (JwtAuthGuard no corrió)', () => {
    try {
      guard.canActivate(contexto('deCajaOJefatura', null));
      throw new Error('debía fallar');
    } catch (error) {
      expect((error as ErrorProblema).tipo).toBe('no-autenticado');
    }
  });
});
