import { ProtectorDatosAesGcm } from '../../../../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { huellaOrigen } from '../../../../../src/modulos/seguridad/aplicacion/auditoria-comun';
import { huellaOrientacion } from '../../../../../src/modulos/orientacion/presentacion/huella-orientacion';

// research R-08 de la 012: la huella de la conexión es un HMAC con la clave de datos (la sal secreta)
// y el prefijo "orientacion:". Nunca se guarda la IP.

const clave = (relleno: string) => Buffer.alloc(32, relleno);
const protector = new ProtectorDatosAesGcm(clave('c'), clave('h'));
const IP = '198.51.100.77';

describe('huellaOrientacion', () => {
  it('es el HMAC-SHA256 en hexadecimal de "orientacion:" + ip', () => {
    expect(huellaOrientacion(protector, IP)).toBe(
      Buffer.from(protector.hmac(`orientacion:${IP}`)).toString('hex'),
    );
    expect(huellaOrientacion(protector, IP)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('no contiene la IP y es distinta de la huella de auditoría de la 009', () => {
    const huella = huellaOrientacion(protector, IP);

    expect(huella).not.toContain(IP);
    expect(huella).not.toContain('198');
    expect(huella).not.toBe(huellaOrigen(protector, IP));
  });

  it('la misma IP da la misma huella y otra IP da otra', () => {
    expect(huellaOrientacion(protector, IP)).toBe(huellaOrientacion(protector, IP));
    expect(huellaOrientacion(protector, '198.51.100.78')).not.toBe(
      huellaOrientacion(protector, IP),
    );
  });

  it('otra clave de datos (otra sal) da otra huella', () => {
    const otro = new ProtectorDatosAesGcm(clave('c'), clave('x'));

    expect(huellaOrientacion(otro, IP)).not.toBe(huellaOrientacion(protector, IP));
  });
});
