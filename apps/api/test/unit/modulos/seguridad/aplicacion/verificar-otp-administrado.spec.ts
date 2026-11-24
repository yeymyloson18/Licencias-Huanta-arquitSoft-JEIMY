import { ConfirmarIdentidadEnLinea } from '../../../../../src/modulos/seguridad/aplicacion/confirmar-identidad-en-linea';
import {
  ErrorAutenticacion,
  ErrorDatosInvalidos,
  ErrorDemasiadosIntentos,
  ErrorIdentidadNoConfirmada,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { VerificarIdentidadAdministrado } from '../../../../../src/modulos/seguridad/aplicacion/verificar-identidad-administrado';
import { VerificarOtpAdministrado } from '../../../../../src/modulos/seguridad/aplicacion/verificar-otp-administrado';
import {
  EmisorIdentidadFalso,
  LimitadorIdentidadFalso,
  RepositorioVerificacionesEnMemoria,
  ServicioIdentificacionFalso,
} from './dobles-identidad';
import { AuditoriaEnMemoria, EventosFalsos } from './dobles';
import { EnviadorFalso, GeneradorFalso, ProtectorFalso, RelojFalso } from './dobles';

const TITULAR = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000001',
  fechaEmision: '2020-01-15',
  ruc: '10400000011',
  celular: '987000001',
};
const REPRESENTANTE = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000002',
  fechaEmision: '2019-05-10',
};

const preparar = () => {
  const verificaciones = new RepositorioVerificacionesEnMemoria();
  const limitador = new LimitadorIdentidadFalso();
  const generador = new GeneradorFalso();
  const protector = new ProtectorFalso();
  const reloj = new RelojFalso();
  const verificar = new VerificarIdentidadAdministrado({
    servicio: new ServicioIdentificacionFalso(),
    verificaciones,
    limitador,
    generador,
    protector,
    enviador: new EnviadorFalso(),
    reloj,
    auditoria: new AuditoriaEnMemoria(),
    eventos: new EventosFalsos(),
  });
  const verificarOtp = new VerificarOtpAdministrado({
    verificaciones,
    limitador,
    generador,
    emisor: new EmisorIdentidadFalso(),
    reloj,
  });
  const confirmar = new ConfirmarIdentidadEnLinea(verificaciones, protector);
  return { verificar, verificarOtp, confirmar, verificaciones, generador, reloj };
};

describe('VerificarOtpAdministrado (paso 2 de la identidad, aclaración 2 de la 004)', () => {
  it('con el código correcto entrega el token de 30 minutos ligado a la verificación', async () => {
    const { verificar, verificarOtp } = preparar();
    const { desafioId } = await verificar.ejecutar({ ...TITULAR, ip: '10.0.0.1' });

    const token = await verificarOtp.ejecutar({ desafioId, codigo: '123456', ip: '10.0.0.1' });

    expect(token).toEqual({ token: `identidad:${desafioId}`, expiraEn: 1800 });
  });

  it.each([
    ['incorrecto', '000000', 0],
    ['vencido', '123456', 301],
  ])('con un código %s responde no autenticado', async (_, codigo, segundos) => {
    const { verificar, verificarOtp, reloj } = preparar();
    const { desafioId } = await verificar.ejecutar({ ...TITULAR, ip: '10.0.0.1' });
    reloj.avanzar(segundos);

    await expect(
      verificarOtp.ejecutar({ desafioId, codigo, ip: '10.0.0.1' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('el código de un desafío reemplazado por otro ya no sirve', async () => {
    const { verificar, verificarOtp, reloj } = preparar();
    const primero = await verificar.ejecutar({ ...TITULAR, ip: '10.0.0.1' });
    reloj.avanzar(10);
    await verificar.ejecutar({ ...TITULAR, ip: '10.0.0.1' });

    await expect(
      verificarOtp.ejecutar({ desafioId: primero.desafioId, codigo: '123456', ip: '10.0.0.1' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('un desafío inexistente responde lo mismo y cuenta para el origen', async () => {
    const { verificarOtp } = preparar();
    for (let intento = 1; intento <= 5; intento += 1) {
      await expect(
        verificarOtp.ejecutar({ desafioId: 'no-existe', codigo: '123456', ip: '10.0.0.7' }),
      ).rejects.toBeInstanceOf(ErrorAutenticacion);
    }

    await expect(
      verificarOtp.ejecutar({ desafioId: 'no-existe', codigo: '123456', ip: '10.0.0.7' }),
    ).rejects.toBeInstanceOf(ErrorDemasiadosIntentos);
  });

  it('el código sirve una sola vez', async () => {
    const { verificar, verificarOtp } = preparar();
    const { desafioId } = await verificar.ejecutar({ ...TITULAR, ip: '10.0.0.1' });
    await verificarOtp.ejecutar({ desafioId, codigo: '123456', ip: '10.0.0.1' });

    await expect(
      verificarOtp.ejecutar({ desafioId, codigo: '123456', ip: '10.0.0.1' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });
});

describe('ConfirmarIdentidadEnLinea (research §R-05 de la 004)', () => {
  const confirmada = async (conRepresentante = false) => {
    const contexto = preparar();
    const datos = conRepresentante ? { ...TITULAR, representante: REPRESENTANTE } : TITULAR;
    const { desafioId } = await contexto.verificar.ejecutar({ ...datos, ip: '10.0.0.1' });
    await contexto.verificarOtp.ejecutar({ desafioId, codigo: '123456', ip: '10.0.0.1' });
    return { ...contexto, desafioId };
  };

  it('acepta la misma identidad que se confirmó', async () => {
    const { confirmar, desafioId } = await confirmada();

    await expect(confirmar.ejecutar(desafioId, TITULAR)).resolves.toBeUndefined();
  });

  it('acepta el documento con espacios o minúsculas (se normaliza igual)', async () => {
    const { confirmar, desafioId } = await confirmada();

    await expect(
      confirmar.ejecutar(desafioId, { ...TITULAR, numeroDocumento: ' 40000001 ' }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['otro documento', { numeroDocumento: '40000009' }],
    ['otro RUC', { ruc: '10400000099' }],
    ['otro celular', { celular: '987000009' }],
  ])('rechaza la identidad con %s', async (_, cambio) => {
    const { confirmar, desafioId } = await confirmada();

    await expect(confirmar.ejecutar(desafioId, { ...TITULAR, ...cambio })).rejects.toBeInstanceOf(
      ErrorIdentidadNoConfirmada,
    );
  });

  it('rechaza agregar o quitar el representante', async () => {
    const sin = await confirmada(false);
    await expect(
      sin.confirmar.ejecutar(sin.desafioId, { ...TITULAR, representante: REPRESENTANTE }),
    ).rejects.toBeInstanceOf(ErrorIdentidadNoConfirmada);

    const con = await confirmada(true);
    await expect(con.confirmar.ejecutar(con.desafioId, TITULAR)).rejects.toBeInstanceOf(
      ErrorIdentidadNoConfirmada,
    );
    await expect(
      con.confirmar.ejecutar(con.desafioId, { ...TITULAR, representante: REPRESENTANTE }),
    ).resolves.toBeUndefined();
  });

  it('rechaza una verificación sin confirmar o inexistente', async () => {
    const { verificar, confirmar } = preparar();
    const { desafioId } = await verificar.ejecutar({ ...TITULAR, ip: '10.0.0.1' });

    await expect(confirmar.ejecutar(desafioId, TITULAR)).rejects.toBeInstanceOf(
      ErrorIdentidadNoConfirmada,
    );
    await expect(confirmar.ejecutar('no-existe', TITULAR)).rejects.toBeInstanceOf(
      ErrorIdentidadNoConfirmada,
    );
  });

  it('una identidad con formato inválido se informa por campo', async () => {
    const { confirmar, desafioId } = await confirmada();

    await expect(confirmar.ejecutar(desafioId, { ...TITULAR, ruc: '123' })).rejects.toBeInstanceOf(
      ErrorDatosInvalidos,
    );
  });
});
