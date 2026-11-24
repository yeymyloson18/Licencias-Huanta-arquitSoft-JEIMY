import {
  huellaOrigen,
  registrarSinFallar,
} from '../../../../../src/modulos/seguridad/aplicacion/auditoria-comun';
import type { ProtectorDatos } from '../../../../../src/compartido/dominio/protector-datos';
import { eventoIngreso } from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';
import { AuditoriaEnMemoria, EventosFalsos, ProtectorFalso, T0 } from './dobles';

/** HMAC de 32 bytes, como el real: el primer byte depende del texto. */
const protector32 = {
  hmac: (texto: string) => {
    const bytes = new Uint8Array(32);
    bytes[0] = texto.length;
    return bytes;
  },
} as unknown as ProtectorDatos;

describe('huellaOrigen (009)', () => {
  it('devuelve el HMAC de la IP en 64 hexadecimales, nunca la IP', () => {
    const huella = huellaOrigen(protector32, '10.0.0.1');

    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(huella).not.toContain('10.0.0.1');
    expect(huellaOrigen(protector32, '10.0.0.1')).toBe(huella);
  });

  it('sin una huella de 32 bytes (dobles de prueba) no guarda origen', () => {
    expect(huellaOrigen(new ProtectorFalso(), '10.0.0.1')).toBeNull();
  });
});

describe('registrarSinFallar (009)', () => {
  const evento = eventoIngreso({
    accion: 'CLAVE_INCORRECTA',
    afectadoUsuarioId: null,
    origenHmac: null,
    en: T0,
  });

  it('guarda el evento', async () => {
    const auditoria = new AuditoriaEnMemoria();
    const eventos = new EventosFalsos();

    await registrarSinFallar(auditoria, eventos, evento);

    expect(auditoria.eventos).toEqual([evento]);
    expect(eventos.registrados).toEqual([]);
  });

  it('si la base falla avisa con fallo-auditoria y no lanza', async () => {
    const auditoria = new AuditoriaEnMemoria();
    auditoria.falla = true;
    const eventos = new EventosFalsos();

    await expect(registrarSinFallar(auditoria, eventos, evento)).resolves.toBeUndefined();
    expect(eventos.nombres()).toEqual(['fallo-auditoria']);
  });
});
