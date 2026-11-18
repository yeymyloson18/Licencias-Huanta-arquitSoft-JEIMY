import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorProblema } from '../../../../../src/compartido/presentacion/error-problema';
import type {
  EmisorTokens,
  ReclamosAcceso,
} from '../../../../../src/modulos/seguridad/dominio/puertos/emisor-tokens';
import { PermitirConClaveTemporal } from '../../../../../src/modulos/seguridad/presentacion/decoradores';
import {
  JwtAuthGuard,
  type PeticionAutenticada,
} from '../../../../../src/modulos/seguridad/presentacion/jwt-auth.guard';

const reclamosValidos: ReclamosAcceso = {
  sub: 'usuario-1',
  sid: 'sesion-1',
  roles: ['CAJA'],
  vs: 1,
  dcc: false,
};

const emisorFalso = (reclamos: ReclamosAcceso | null): EmisorTokens => ({
  segundosDeVida: 900,
  firmarAcceso: () => Promise.resolve('token'),
  verificarAcceso: (token) => Promise.resolve(token === 'valido' ? reclamos : null),
});

class ControladorDePrueba {
  normal(): void {
    /* operación protegida cualquiera */
  }

  @PermitirConClaveTemporal()
  cambiarClave(): void {
    /* única operación permitida con clave temporal */
  }
}

const contexto = (
  autorizacion: string | undefined,
  metodo: keyof ControladorDePrueba = 'normal',
): { contexto: ExecutionContext; peticion: PeticionAutenticada } => {
  const peticion = {
    headers: autorizacion === undefined ? {} : { authorization: autorizacion },
  } as PeticionAutenticada;
  return {
    peticion,
    contexto: {
      getHandler: () => ControladorDePrueba.prototype[metodo],
      getClass: () => ControladorDePrueba,
      switchToHttp: () => ({ getRequest: () => peticion }),
    } as unknown as ExecutionContext,
  };
};

const esperarProblema = async (promesa: Promise<boolean>, tipo: string): Promise<void> => {
  await expect(promesa).rejects.toBeInstanceOf(ErrorProblema);
  await promesa.catch((error: unknown) => {
    expect((error as ErrorProblema).tipo).toBe(tipo);
  });
};

describe('JwtAuthGuard (básico)', () => {
  const guard = (reclamos: ReclamosAcceso | null = reclamosValidos) =>
    new JwtAuthGuard(emisorFalso(reclamos), new Reflector());

  it.each([
    ['sin Authorization', undefined],
    ['con otro esquema', 'Basic valido'],
    ['con Bearer vacío', 'Bearer '],
    ['con token inválido o vencido', 'Bearer otro'],
  ])('responde 401 no-autenticado %s', async (_, autorizacion) => {
    await esperarProblema(guard().canActivate(contexto(autorizacion).contexto), 'no-autenticado');
  });

  it('con un token válido deja el usuario autenticado en la petición', async () => {
    const { contexto: ctx, peticion } = contexto('Bearer valido');

    await expect(guard().canActivate(ctx)).resolves.toBe(true);
    expect(peticion.usuarioAutenticado).toEqual({
      usuarioId: 'usuario-1',
      sesionId: 'sesion-1',
      roles: ['CAJA'],
      versionSeguridad: 1,
      debeCambiarClave: false,
    });
  });

  it('con clave temporal responde 403 debe-cambiar-clave (FR-022)', async () => {
    await esperarProblema(
      guard({ ...reclamosValidos, dcc: true }).canActivate(contexto('Bearer valido').contexto),
      'debe-cambiar-clave',
    );
  });

  it('con clave temporal permite las operaciones marcadas con @PermitirConClaveTemporal', async () => {
    const { contexto: ctx } = contexto('Bearer valido', 'cambiarClave');

    await expect(guard({ ...reclamosValidos, dcc: true }).canActivate(ctx)).resolves.toBe(true);
  });
});
