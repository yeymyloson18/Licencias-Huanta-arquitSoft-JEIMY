import { ErrorValidacionSolicitud } from '../../../../../src/modulos/tramites/dominio/errores';
import {
  crearExpediente,
  type DatosNuevoExpediente,
} from '../../../../../src/modulos/tramites/dominio/expediente';
import { NumeroExpediente } from '../../../../../src/modulos/tramites/dominio/numero-expediente';
import type { RecetaAlPresentar } from '../../../../../src/modulos/tramites/dominio/receta-al-presentar';

const AHORA = new Date('2026-11-19T15:00:00.000Z');

const receta = (ruta: 'A' | 'B' | 'C' = 'A'): RecetaAlPresentar => ({
  codigo: ruta === 'C' ? 'LIC-09' : 'LIC-02',
  nombre: 'Licencia de prueba',
  ruta,
  tasa: '177.10',
  plazoDias: 2,
  tipoPlazo: 'HABILES',
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'POSTERIOR',
  plazoItseDias: 9,
  vigenciaMeses: null,
  requisitos: [],
});

// Datos FICTICIOS.
const datos = (cambios: Partial<DatosNuevoExpediente> = {}): DatosNuevoExpediente => ({
  numero: NumeroExpediente.crear(2026, 1),
  receta: receta(),
  canal: 'EN_LINEA',
  titular: {
    tipoDocumento: 'DNI',
    numeroDocumento: '40000001',
    ruc: '10400000011',
    celular: '987000001',
    correo: ' titular@ejemplo.pe ',
    nombre: '  Titular de Prueba  ',
    razonSocial: '',
  },
  representante: null,
  establecimiento: {
    nombreComercial: null,
    giro: 'Bodega',
    direccion: 'Jr. Ficticio 123',
    zona: 'Centro',
    areaM2: 40,
  },
  documentos: [],
  presentadoEn: AHORA,
  registradoPor: null,
  verificacionId: 'verificacion-1',
  ...cambios,
});

const camposRechazados = (cambios: Partial<DatosNuevoExpediente>): string[] => {
  try {
    crearExpediente(datos(cambios));
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorValidacionSolicitud);
    return (error as ErrorValidacionSolicitud).errores.map((falla) => falla.campo);
  }
  throw new Error('Se esperaba ErrorValidacionSolicitud');
};

const establecimiento = (cambios: Partial<DatosNuevoExpediente['establecimiento']>) => ({
  establecimiento: { ...datos().establecimiento, ...cambios },
});

describe('Expediente (FR-016, FR-015 y data-model.md §2 de la 004)', () => {
  it('se crea solo REGISTRADO, con la ruta de la receta y su primer registro del historial', () => {
    const expediente = crearExpediente(datos({ receta: receta('B') }));

    expect(expediente).toMatchObject({
      estado: 'REGISTRADO',
      ruta: 'B',
      canal: 'EN_LINEA',
      vencePlazoEn: null,
      historial: [
        {
          estadoAnterior: null,
          estadoNuevo: 'REGISTRADO',
          usuarioId: null,
          comentario: 'Presentada en línea',
          ocurridoEn: AHORA,
        },
      ],
    });
    expect(expediente.titular.nombre).toBe('Titular de Prueba');
    expect(expediente.titular.correo).toBe('titular@ejemplo.pe');
    expect(expediente.titular.razonSocial).toBeNull();
  });

  it('en mesa de partes guarda quién lo registró en el historial', () => {
    const expediente = crearExpediente(
      datos({ canal: 'MESA_PARTES', registradoPor: 'usuario-1', verificacionId: null }),
    );

    expect(expediente.historial[0]).toMatchObject({
      usuarioId: 'usuario-1',
      comentario: 'Registrada en mesa de partes',
    });
  });

  it.each([
    [{ canal: 'EN_LINEA' as const, verificacionId: null }],
    [{ canal: 'MESA_PARTES' as const, registradoPor: null }],
  ])('rechaza un canal sin su identificación (%o)', (cambio) => {
    expect(camposRechazados(cambio)).toContain('canal');
  });

  it.each([
    ['giro vacío', establecimiento({ giro: '   ' }), 'giro'],
    ['giro de 151 caracteres', establecimiento({ giro: 'a'.repeat(151) }), 'giro'],
    ['dirección de 301 caracteres', establecimiento({ direccion: 'a'.repeat(301) }), 'direccion'],
    ['zona de 61 caracteres', establecimiento({ zona: 'a'.repeat(61) }), 'zona'],
    ['área 0', establecimiento({ areaM2: 0 }), 'areaM2'],
    ['área con 3 decimales', establecimiento({ areaM2: 40.123 }), 'areaM2'],
  ])('rechaza %s', (_, cambio, campo) => {
    expect(camposRechazados(cambio)).toEqual([campo]);
  });

  it('acepta un área con 2 decimales', () => {
    expect(crearExpediente(datos(establecimiento({ areaM2: 40.1 }))).establecimiento.areaM2).toBe(
      40.1,
    );
  });

  it('la licencia de bodega (ruta C) admite hasta 50 m² y exige el área', () => {
    expect(
      crearExpediente(datos({ receta: receta('C'), ...establecimiento({ areaM2: 50 }) })).ruta,
    ).toBe('C');
    expect(
      camposRechazados({ receta: receta('C'), ...establecimiento({ areaM2: 50.01 }) }),
    ).toEqual(['areaM2']);
    expect(camposRechazados({ receta: receta('C'), ...establecimiento({ areaM2: null }) })).toEqual(
      ['areaM2'],
    );
  });

  it('informa todos los errores juntos, sin repetir los valores', () => {
    try {
      crearExpediente(
        datos({
          titular: { ...datos().titular, nombre: '', correo: 'no-es-correo' },
          ...establecimiento({ giro: '', zona: '' }),
        }),
      );
    } catch (error) {
      const errores = (error as ErrorValidacionSolicitud).errores;
      expect(errores.map((falla) => falla.campo)).toEqual([
        'nombreTitular',
        'correo',
        'giro',
        'zona',
      ]);
      expect(JSON.stringify(errores)).not.toContain('no-es-correo');
    }
    expect.assertions(2);
  });
});
