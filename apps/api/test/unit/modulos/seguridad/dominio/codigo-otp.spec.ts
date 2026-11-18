import { CodigoOtp } from '../../../../../src/modulos/seguridad/dominio/codigo-otp';

const T0 = new Date('2026-11-17T10:00:00.000Z');
const despues = (segundos: number) => new Date(T0.getTime() + segundos * 1000);

const nuevo = () =>
  CodigoOtp.crear({
    id: 'desafio-1',
    usuarioId: 'usuario-1',
    destinoHmac: new Uint8Array([1, 2, 3]),
    codigoHash: 'hash-del-codigo',
    creadoEn: T0,
  });

describe('CodigoOtp', () => {
  it('vence a los 5 minutos de creado ("Creación + 5 min")', () => {
    expect(nuevo().venceEn).toEqual(despues(300));
  });

  it('empieza con 0 intentos y sin usar', () => {
    const codigo = nuevo();

    expect(codigo.intentos).toBe(0);
    expect(codigo.usadoEn).toBeUndefined();
  });

  it('el código correcto antes de vencer devuelve CORRECTO y queda usado', () => {
    const codigo = nuevo();

    expect(codigo.verificar(true, despues(60))).toBe('CORRECTO');
    expect(codigo.usadoEn).toEqual(despues(60));
  });

  it('un código usado no vuelve a servir', () => {
    const codigo = nuevo();
    codigo.verificar(true, despues(60));

    expect(codigo.verificar(true, despues(61))).toBe('VENCIDO');
  });

  it('un código incorrecto suma un intento', () => {
    const codigo = nuevo();

    expect(codigo.verificar(false, despues(10))).toBe('INCORRECTO');
    expect(codigo.intentos).toBe(1);
  });

  it('a los 5 minutos ya no sirve, aunque sea correcto', () => {
    expect(nuevo().verificar(true, despues(300))).toBe('VENCIDO');
  });

  it('el 5.º fallo deja el código AGOTADO ("0 a 5" intentos)', () => {
    const codigo = nuevo();
    for (let i = 1; i <= 5; i += 1) {
      expect(codigo.verificar(false, despues(i))).toBe('INCORRECTO');
    }

    expect(codigo.intentos).toBe(5);
    expect(codigo.verificar(true, despues(10))).toBe('AGOTADO');
    expect(codigo.intentos).toBe(5);
  });

  it('se puede vencer antes de tiempo (al pedir otro código)', () => {
    const codigo = nuevo();

    codigo.vencer(despues(30));

    expect(codigo.verificar(true, despues(31))).toBe('VENCIDO');
  });

  it('se reconstruye con su estado', () => {
    const codigo = CodigoOtp.reconstruir({
      id: 'desafio-1',
      usuarioId: 'usuario-1',
      destinoHmac: new Uint8Array([1]),
      codigoHash: 'h',
      intentos: 3,
      venceEn: despues(300),
      usadoEn: undefined,
    });

    expect(codigo.intentos).toBe(3);
    expect(codigo.verificar(false, despues(1))).toBe('INCORRECTO');
    expect(codigo.intentos).toBe(4);
  });
});
