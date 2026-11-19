import { ProtectorDatosAesGcm } from '../../../src/compartido/infraestructura/protector-datos-aes-gcm';

const clave = (relleno: string) => Buffer.alloc(32, relleno);
const protector = new ProtectorDatosAesGcm(clave('c'), clave('h'));

describe('ProtectorDatosAesGcm', () => {
  it('cifra y descifra ida y vuelta', () => {
    const cifrado = protector.cifrar('987654321');

    expect(protector.descifrar(cifrado)).toBe('987654321');
  });

  it('el texto cifrado no contiene el texto en claro', () => {
    expect(Buffer.from(protector.cifrar('987654321')).toString('latin1')).not.toContain(
      '987654321',
    );
  });

  it('dos cifrados del mismo texto difieren (IV aleatorio)', () => {
    expect(Buffer.from(protector.cifrar('a@ejemplo.pe'))).not.toEqual(
      Buffer.from(protector.cifrar('a@ejemplo.pe')),
    );
  });

  it('usa el formato iv(12) + tag(16) + texto', () => {
    expect(protector.cifrar('abc')).toHaveLength(12 + 16 + 3);
  });

  it('rechaza un texto cifrado alterado', () => {
    const cifrado = Buffer.from(protector.cifrar('987654321'));
    const ultimo = cifrado.length - 1;
    cifrado[ultimo] = (cifrado[ultimo] ?? 0) ^ 0xff;

    expect(() => protector.descifrar(cifrado)).toThrow();
  });

  it('no descifra con otra clave', () => {
    const otro = new ProtectorDatosAesGcm(clave('x'), clave('h'));

    expect(() => otro.descifrar(protector.cifrar('987654321'))).toThrow();
  });

  it('el HMAC es determinista, de 32 bytes y depende de la clave', () => {
    const otro = new ProtectorDatosAesGcm(clave('c'), clave('y'));

    expect(Buffer.from(protector.hmac('a@ejemplo.pe'))).toEqual(
      Buffer.from(protector.hmac('a@ejemplo.pe')),
    );
    expect(Buffer.from(protector.hmac('a@ejemplo.pe'))).not.toEqual(
      Buffer.from(otro.hmac('a@ejemplo.pe')),
    );
    expect(protector.hmac('a@ejemplo.pe')).toHaveLength(32);
  });
});
