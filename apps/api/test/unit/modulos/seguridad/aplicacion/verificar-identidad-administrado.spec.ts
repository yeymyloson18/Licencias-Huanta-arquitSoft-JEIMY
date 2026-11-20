import {
  ErrorDatosInvalidos,
  ErrorDemasiadosIntentos,
  ErrorIdentidadNoCoincide,
  ErrorIdentificacionNoDisponible,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { VerificarIdentidadAdministrado } from '../../../../../src/modulos/seguridad/aplicacion/verificar-identidad-administrado';
import { ErrorEnvioOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import { ErrorLimitadorNoDisponible } from '../../../../../src/modulos/seguridad/dominio/puertos/limitador-intentos';
import {
  LimitadorIdentidadFalso,
  RepositorioVerificacionesEnMemoria,
  ServicioIdentificacionFalso,
} from './dobles-identidad';
import { EnviadorFalso, GeneradorFalso, ProtectorFalso, RelojFalso, T0 } from './dobles';

// Datos FICTICIOS (quickstart.md de la 004).
const TITULAR = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000001',
  fechaEmision: '2020-01-15',
  ruc: '10400000011',
  celular: '987000001',
};

const preparar = () => {
  const servicio = new ServicioIdentificacionFalso();
  const verificaciones = new RepositorioVerificacionesEnMemoria();
  const limitador = new LimitadorIdentidadFalso();
  const enviador = new EnviadorFalso();
  const reloj = new RelojFalso();
  const casoDeUso = new VerificarIdentidadAdministrado({
    servicio,
    verificaciones,
    limitador,
    generador: new GeneradorFalso(),
    protector: new ProtectorFalso(),
    enviador,
    reloj,
  });
  return { casoDeUso, servicio, verificaciones, limitador, enviador, reloj };
};

const errorDe = async (promesa: Promise<unknown>): Promise<unknown> => {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error');
};

describe('VerificarIdentidadAdministrado (CU03, FR-001 a FR-007 de la 004)', () => {
  it('si el servicio confirma, guarda solo huellas y envía el código al celular', async () => {
    const { casoDeUso, verificaciones, enviador } = preparar();

    const desafio = await casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' });

    expect(desafio).toEqual({
      desafioId: 'id-1',
      venceEn: new Date(T0.getTime() + 5 * 60 * 1000),
      celularEnmascarado: '9*****001',
    });
    expect(enviador.enviados).toEqual([
      { destino: '987000001', codigo: '123456', usuarioId: 'id-1' },
    ]);
    const verificacion = verificaciones.verificaciones.get('id-1');
    const huellas = JSON.stringify(
      Object.values(verificacion?.huellas ?? {}).map((valor: unknown) =>
        valor instanceof Uint8Array ? new TextDecoder().decode(valor) : valor,
      ),
    );
    expect(huellas).toContain('m:DNI:40000001');
    expect(verificacion?.codigoHash).toBe('hmac:id-1:123456');
  });

  it('si los datos no coinciden no envía código y el error no dice qué dato falló', async () => {
    const { casoDeUso, servicio, enviador, verificaciones } = preparar();
    servicio.resultado = 'NO_COINCIDE';

    const error = await errorDe(casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' }));

    expect(error).toBeInstanceOf(ErrorIdentidadNoCoincide);
    expect((error as Error).message).not.toMatch(/4000|1040|98700/);
    expect(enviador.enviados).toEqual([]);
    expect(verificaciones.rechazos.map((rechazo) => rechazo.resultado)).toEqual(['NO_VALIDO']);
  });

  it('si el servicio no responde lanza "no disponible" y no castiga el intento', async () => {
    const { casoDeUso, servicio, limitador } = preparar();
    servicio.resultado = 'NO_DISPONIBLE';

    await expect(casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' })).rejects.toBeInstanceOf(
      ErrorIdentificacionNoDisponible,
    );
    expect([...limitador.fallos.values()].every((cuenta) => cuenta === 0)).toBe(true);
  });

  it('con representante comprueba las dos identidades', async () => {
    const { casoDeUso, servicio } = preparar();

    await casoDeUso.ejecutar({
      ...TITULAR,
      representante: {
        tipoDocumento: 'DNI',
        numeroDocumento: '40000002',
        fechaEmision: '2019-05-10',
      },
      ip: '10.0.0.1',
    });

    expect(servicio.consultas[0]?.representante).toEqual({
      tipoDocumento: 'DNI',
      numeroDocumento: '40000002',
      fechaEmision: '2019-05-10',
    });
  });

  it('valida el formato antes de consultar el servicio y nombra solo los campos', async () => {
    const { casoDeUso, servicio } = preparar();

    const error = await errorDe(
      casoDeUso.ejecutar({
        ...TITULAR,
        fechaEmision: '2020-02-30',
        celular: '12345',
        ip: '10.0.0.1',
      }),
    );

    expect(error).toBeInstanceOf(ErrorDatosInvalidos);
    expect((error as ErrorDatosInvalidos).campos).toEqual(['fechaEmision', 'celular']);
    expect(servicio.consultas).toEqual([]);
  });

  it('bloquea el 6.º intento fallido con el mismo documento', async () => {
    const { casoDeUso, servicio } = preparar();
    servicio.resultado = 'NO_COINCIDE';
    for (let intento = 1; intento <= 5; intento += 1) {
      await expect(
        casoDeUso.ejecutar({ ...TITULAR, ip: `10.0.0.${String(intento)}` }),
      ).rejects.toBeInstanceOf(ErrorIdentidadNoCoincide);
    }

    await expect(casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.99' })).rejects.toBeInstanceOf(
      ErrorDemasiadosIntentos,
    );
  });

  it('permite 3 envíos de código por celular en 15 minutos', async () => {
    const { casoDeUso } = preparar();
    for (let envio = 1; envio <= 3; envio += 1) {
      await casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' });
    }

    await expect(casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' })).rejects.toBeInstanceOf(
      ErrorDemasiadosIntentos,
    );
  });

  it('otro código vence el anterior del mismo documento', async () => {
    const { casoDeUso, verificaciones, reloj } = preparar();
    await casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' });
    reloj.avanzar(30);

    await casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' });

    expect(verificaciones.verificaciones.get('id-1')?.venceEn).toEqual(reloj.ahora());
  });

  it('si el envío del código falla devuelve el envío reservado', async () => {
    const { casoDeUso, enviador, limitador } = preparar();
    enviador.falla = true;

    await expect(casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' })).rejects.toBeInstanceOf(
      ErrorEnvioOtp,
    );
    expect([...limitador.envios.values()]).toEqual([0]);
  });

  it('falla cerrado si no puede contar los intentos', async () => {
    const { casoDeUso, limitador, servicio } = preparar();
    limitador.noDisponible = true;

    await expect(casoDeUso.ejecutar({ ...TITULAR, ip: '10.0.0.1' })).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    expect(servicio.consultas).toEqual([]);
  });

  it('acepta el carné de extranjería sin fecha de emisión', async () => {
    const { casoDeUso, servicio } = preparar();

    await casoDeUso.ejecutar({
      tipoDocumento: 'CE',
      numeroDocumento: '000123456',
      ruc: '15000123456',
      celular: '987000002',
      ip: '10.0.0.1',
    });

    expect(servicio.consultas[0]?.titular).toMatchObject({
      tipoDocumento: 'CE',
      fechaEmision: null,
    });
  });
});
