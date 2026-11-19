import { ErrorDatosInvalidos } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import {
  aHex,
  calcularHuellas,
  datosParaServicio,
  leerIdentidad,
} from '../../../../../src/modulos/seguridad/aplicacion/identidad-comun';
import type { DatosIdentidadAdministrado } from '../../../../../src/modulos/seguridad/dominio/identidad-administrado';
import { ProtectorFalso } from './dobles';

// Datos FICTICIOS (specs/004-solicitud-consulta/quickstart.md).
const TITULAR: DatosIdentidadAdministrado = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000001',
  fechaEmision: '2020-01-15',
  ruc: '10400000011',
  celular: '987000001',
};

describe('identidad-comun (piezas de la identidad del administrado)', () => {
  const protector = new ProtectorFalso();

  it('un formato inválido se convierte en ErrorDatosInvalidos con solo los campos', () => {
    expect(() => leerIdentidad({ ...TITULAR, ruc: '123' })).toThrow(ErrorDatosInvalidos);
  });

  it('un error inesperado no se disfraza de datos inválidos', () => {
    expect(() => leerIdentidad(null as unknown as DatosIdentidadAdministrado)).toThrow(TypeError);
  });

  it('sin representante su huella es nula; con representante se calcula con tipo y número', () => {
    const sola = calcularHuellas(leerIdentidad(TITULAR), protector);
    const conRepresentante = calcularHuellas(
      leerIdentidad({
        ...TITULAR,
        representante: {
          tipoDocumento: 'DNI',
          numeroDocumento: '40000002',
          fechaEmision: '2019-05-10',
        },
      }),
      protector,
    );

    expect(sola.representanteHmac).toBeNull();
    expect(conRepresentante.representanteHmac).not.toBeNull();
    expect(conRepresentante.documentoHmac).toEqual(sola.documentoHmac);
    expect(conRepresentante.representanteHmac).not.toEqual(sola.documentoHmac);
  });

  it('un DNI y un CE con el mismo número tienen huellas distintas', () => {
    const dni = calcularHuellas(
      leerIdentidad({ ...TITULAR, numeroDocumento: '12345678' }),
      protector,
    );
    const ce = calcularHuellas(
      leerIdentidad({
        tipoDocumento: 'CE',
        numeroDocumento: '12345678',
        ruc: '15000123456',
        celular: '987000002',
      }),
      protector,
    );

    expect(ce.documentoHmac).not.toEqual(dni.documentoHmac);
  });

  it('arma los datos para el servicio de identificación con el RUC en el titular', () => {
    const datos = datosParaServicio(leerIdentidad(TITULAR));

    expect(datos.titular).toMatchObject({ numeroDocumento: '40000001', ruc: '10400000011' });
    expect(datos.representante).toBeNull();
  });

  it('convierte bytes a hexadecimal con dos dígitos por byte', () => {
    expect(aHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });
});
