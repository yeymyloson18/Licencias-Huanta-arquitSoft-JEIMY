import {
  ErrorSinLicenciaVigente,
  RegistrarCertificado,
} from '../../../../../src/modulos/licencias/aplicacion/registrar-certificado';

describe('RegistrarCertificado (FR-005 y FR-006 de la 006)', () => {
  const registrar = (resultado: 'REGISTRADO' | 'YA_EXISTIA' | 'SIN_LICENCIA') => {
    const pedidos: unknown[] = [];
    const caso = new RegistrarCertificado({
      registrarCertificado: (numero, certificado) => {
        pedidos.push({ numero, certificado });
        return Promise.resolve(resultado);
      },
    });
    return {
      pedidos,
      promesa: caso.ejecutar({
        numeroExpediente: 'EXP-2026-000001',
        numero: 'ITSE-001',
        emitidoEn: '2026-11-19',
      }),
    };
  };

  it('registra el certificado en la licencia vigente del expediente', async () => {
    const { pedidos, promesa } = registrar('REGISTRADO');

    expect(await promesa).toBe('REGISTRADO');
    expect(pedidos).toEqual([
      { numero: 'EXP-2026-000001', certificado: { numero: 'ITSE-001', emitidoEn: '2026-11-19' } },
    ]);
  });

  it('un evento repetido no duplica (idempotente)', async () => {
    expect(await registrar('YA_EXISTIA').promesa).toBe('YA_EXISTIA');
  });

  it('sin licencia vigente falla para que el evento se reintente', async () => {
    await expect(registrar('SIN_LICENCIA').promesa).rejects.toBeInstanceOf(ErrorSinLicenciaVigente);
  });
});
