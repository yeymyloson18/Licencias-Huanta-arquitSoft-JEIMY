import {
  ErrorDatosInvalidos,
  ErrorIdentidadNoCoincide,
  ErrorIdentificacionNoDisponible,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { VerificarIdentidadPresencial } from '../../../../../src/modulos/seguridad/aplicacion/verificar-identidad-presencial';
import type { DatosIdentidadAdministrado } from '../../../../../src/modulos/seguridad/dominio/identidad-administrado';
import { ServicioIdentificacionFalso } from './dobles-identidad';

// Datos FICTICIOS (specs/004-solicitud-consulta/quickstart.md).
const EXTRANJERO: DatosIdentidadAdministrado = {
  tipoDocumento: 'CE',
  numeroDocumento: '000123456',
  ruc: '15000123456',
  celular: '987000002',
};

describe('VerificarIdentidadPresencial (mesa de partes, 004)', () => {
  let servicio: ServicioIdentificacionFalso;
  let verificar: VerificarIdentidadPresencial;

  beforeEach(() => {
    servicio = new ServicioIdentificacionFalso();
    verificar = new VerificarIdentidadPresencial(servicio);
  });

  it('COINCIDE → válida, consultando al servicio sin enviar ningún código', async () => {
    await expect(verificar.ejecutar(EXTRANJERO)).resolves.toBeUndefined();

    expect(servicio.consultas).toEqual([
      {
        titular: {
          tipoDocumento: 'CE',
          numeroDocumento: '000123456',
          fechaEmision: null,
          ruc: '15000123456',
        },
        representante: null,
      },
    ]);
  });

  it('NO_COINCIDE → error que no nombra el dato', async () => {
    servicio.resultado = 'NO_COINCIDE';

    const error: unknown = await verificar.ejecutar(EXTRANJERO).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorIdentidadNoCoincide);
    expect((error as Error).message).not.toMatch(/000123456|15000123456|987000002/);
  });

  it('NO_DISPONIBLE → servicio no disponible', async () => {
    servicio.resultado = 'NO_DISPONIBLE';

    await expect(verificar.ejecutar(EXTRANJERO)).rejects.toBeInstanceOf(
      ErrorIdentificacionNoDisponible,
    );
  });

  it('con representante comprueba las dos identidades', async () => {
    await verificar.ejecutar({
      ...EXTRANJERO,
      representante: {
        tipoDocumento: 'DNI',
        numeroDocumento: '40000002',
        fechaEmision: '2019-05-10',
      },
    });

    expect(servicio.consultas[0]?.representante).toEqual({
      tipoDocumento: 'DNI',
      numeroDocumento: '40000002',
      fechaEmision: '2019-05-10',
    });
  });

  it('un formato inválido no llega al servicio', async () => {
    await expect(verificar.ejecutar({ ...EXTRANJERO, ruc: '123' })).rejects.toBeInstanceOf(
      ErrorDatosInvalidos,
    );
    expect(servicio.consultas).toHaveLength(0);
  });
});
