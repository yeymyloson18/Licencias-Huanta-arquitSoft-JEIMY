import { AsignacionRol } from '../../../../../src/modulos/seguridad/dominio/asignacion-rol';
import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';
import { ErrorEnvioOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import { ErrorLimitadorNoDisponible } from '../../../../../src/modulos/seguridad/dominio/puertos/limitador-intentos';

const T0 = new Date('2026-11-17T10:00:00Z');
const T1 = new Date('2026-11-17T11:00:00Z');

describe('AsignacionRol', () => {
  it('una asignación nueva está vigente y sin id hasta guardarse', () => {
    const asignacion = AsignacionRol.nueva('CAJA', 'admin', T0);

    expect(asignacion.esVigente).toBe(true);
    expect(asignacion.id).toBeUndefined();
    expect(asignacion.retiradoPor).toBeUndefined();
    expect(asignacion.retiradoEn).toBeUndefined();
  });

  it('se reconstruye retirada con quién y cuándo', () => {
    const asignacion = AsignacionRol.reconstruir({
      id: 'a-1',
      rol: 'CAJA',
      asignadoPor: 'admin',
      asignadoEn: T0,
      retiradoPor: 'admin-2',
      retiradoEn: T1,
    });

    expect(asignacion.id).toBe('a-1');
    expect(asignacion.esVigente).toBe(false);
    expect(asignacion.retiradoPor).toBe('admin-2');
    expect(asignacion.retiradoEn).toEqual(T1);
  });

  it('exige quién y cuándo juntos ("ambos nulos o ambos con valor")', () => {
    expect(() =>
      AsignacionRol.reconstruir({ rol: 'CAJA', asignadoPor: 'a', asignadoEn: T0, retiradoEn: T1 }),
    ).toThrow(ErrorDominio);
    expect(() =>
      AsignacionRol.reconstruir({
        rol: 'CAJA',
        asignadoPor: 'a',
        asignadoEn: T0,
        retiradoPor: 'b',
      }),
    ).toThrow(ErrorDominio);
  });

  it('retirada es un estado terminal', () => {
    const asignacion = AsignacionRol.nueva('CAJA', 'admin', T0);
    asignacion.retirar('admin', T1);

    expect(() => asignacion.retirar('admin', T1)).toThrow(ErrorDominio);
  });
});

describe('Errores de los puertos', () => {
  it('ErrorEnvioOtp y ErrorLimitadorNoDisponible no exponen datos', () => {
    expect(new ErrorEnvioOtp()).toMatchObject({
      name: 'ErrorEnvioOtp',
      message: 'No se pudo enviar el código',
    });
    expect(new ErrorLimitadorNoDisponible()).toMatchObject({
      name: 'ErrorLimitadorNoDisponible',
      message: 'Los límites de intentos no están disponibles',
    });
  });
});
