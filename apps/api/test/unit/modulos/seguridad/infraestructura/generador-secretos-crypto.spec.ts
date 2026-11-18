import { GeneradorSecretosCrypto } from '../../../../../src/modulos/seguridad/infraestructura/generador-secretos-crypto';

const generador = new GeneradorSecretosCrypto(Buffer.alloc(32, 'h'));

describe('GeneradorSecretosCrypto', () => {
  it('genera códigos de exactamente 6 dígitos', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generador.codigoOtp()).toMatch(/^[0-9]{6}$/);
    }
  });

  it('rellena con ceros a la izquierda', () => {
    const conCeros = new GeneradorSecretosCrypto(Buffer.alloc(32, 'h'), () => 42);

    expect(conCeros.codigoOtp()).toBe('000042');
  });

  it('genera ids UUID v4', () => {
    expect(generador.generarId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('el refresh token es <sesionId>.<32 bytes en base64url> y no se repite', () => {
    const token = generador.refreshToken('sesion-1');
    const [sesion, secreto] = token.split('.');

    expect(sesion).toBe('sesion-1');
    expect(secreto).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generador.refreshToken('sesion-1')).not.toBe(token);
  });

  it('el HMAC del código depende del desafío y no contiene el código', () => {
    expect(generador.hmacCodigo('d1', '123456')).toBe(generador.hmacCodigo('d1', '123456'));
    expect(generador.hmacCodigo('d1', '123456')).not.toBe(generador.hmacCodigo('d2', '123456'));
    expect(generador.hmacCodigo('d1', '123456')).not.toContain('123456');
  });

  it('calcula SHA-256 en hexadecimal', () => {
    expect(generador.sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('compara en tiempo constante, también con longitudes distintas', () => {
    expect(generador.igualesEnTiempoConstante('abc', 'abc')).toBe(true);
    expect(generador.igualesEnTiempoConstante('abc', 'abd')).toBe(false);
    expect(generador.igualesEnTiempoConstante('abc', 'abcd')).toBe(false);
  });
});
