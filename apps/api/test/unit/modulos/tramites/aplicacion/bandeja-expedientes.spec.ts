import { ErrorExpedienteNoEncontrado } from '../../../../../src/modulos/tramites/aplicacion/errores';
import {
  DescargarDocumento,
  ListarExpedientes,
  ObtenerDetalleExpediente,
} from '../../../../../src/modulos/tramites/aplicacion/bandeja-expedientes';
import { enmascararDocumento } from '../../../../../src/modulos/tramites/dominio/enmascarar-documento';
import { ErrorValidacionSolicitud } from '../../../../../src/modulos/tramites/dominio/errores';
import type { NumeroExpediente } from '../../../../../src/modulos/tramites/dominio/numero-expediente';
import type {
  DocumentoGuardado,
  ExpedienteDetalle,
  ExpedienteResumen,
  FiltroBandeja,
  PaginaExpedientes,
  RepositorioExpedientes,
} from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-expedientes';
import { AlmacenFalso, RelojFalso, T0 } from '../apoyo/dobles';

// Bandeja del personal (historia 4 de la 004). Datos FICTICIOS.

const resumen = (
  numero: string,
  estado: ExpedienteResumen['estado'],
  ruta: ExpedienteResumen['ruta'],
  dia: number,
): ExpedienteResumen => ({
  numero,
  estado,
  ruta,
  codigoReceta: 'LIC-02',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  nombreTitular: 'Titular de Prueba',
  giro: 'Bodega',
  presentadoEn: new Date(Date.UTC(2026, 10, dia)),
  vencePlazoEn: null,
});

const DETALLE: ExpedienteDetalle = {
  ...resumen('EXP-2026-000001', 'REGISTRADO', 'A', 1),
  version: 1,
  canal: 'EN_LINEA',
  documentoTitular: '40000021',
  razonSocial: null,
  nombreComercial: null,
  direccion: 'Jr. Ficticio 123',
  zona: 'Centro',
  areaM2: 40,
  nivelRiesgoPropuesto: null,
  nivelRiesgoConfirmado: null,
  observaciones: [],
  documentos: [
    { id: 'doc-1', requisitoId: 11, nombreOriginal: 'solicitud.pdf', tipoMime: 'application/pdf' },
  ],
  historial: [
    {
      estadoAnterior: null,
      estadoNuevo: 'REGISTRADO',
      comentario: 'Presentada en línea',
      ocurridoEn: T0,
    },
  ],
};

/** Repositorio en memoria con la misma semántica que el de PostgreSQL. */
class ExpedientesEnMemoria implements Pick<
  RepositorioExpedientes,
  'listar' | 'obtenerDetalle' | 'buscarDocumento'
> {
  filas: ExpedienteResumen[] = [
    resumen('EXP-2026-000001', 'REGISTRADO', 'A', 1),
    resumen('EXP-2026-000002', 'REGISTRADO', 'B', 3),
    resumen('EXP-2026-000003', 'OBSERVADO', 'B', 2),
    resumen('EXP-2026-000004', 'REGISTRADO', 'B', 5),
  ];
  readonly vistas: { numero: string; usuarioId: string; en: Date }[] = [];
  readonly documentos = new Map<string, Map<string, DocumentoGuardado>>([
    [
      'EXP-2026-000001',
      new Map([
        [
          'doc-1',
          { claveAlmacen: 'clave-1', nombreOriginal: 'solicitud.pdf', tipoMime: 'application/pdf' },
        ],
      ]),
    ],
  ]);

  listar(filtro: FiltroBandeja): Promise<PaginaExpedientes> {
    const cumplen = this.filas
      .filter((fila) => filtro.estado === null || fila.estado === filtro.estado)
      .filter((fila) => filtro.ruta === null || fila.ruta === filtro.ruta)
      .sort((a, b) => b.presentadoEn.getTime() - a.presentadoEn.getTime());
    const desde = (filtro.pagina - 1) * filtro.porPagina;
    return Promise.resolve({
      total: cumplen.length,
      datos: cumplen.slice(desde, desde + filtro.porPagina),
    });
  }

  obtenerDetalle(numero: NumeroExpediente, lector: { usuarioId: string; en: Date } | null) {
    if (numero.valor !== DETALLE.numero) {
      return Promise.resolve(null);
    }
    if (lector !== null) {
      this.vistas.push({ numero: numero.valor, ...lector });
    }
    return Promise.resolve(DETALLE);
  }

  buscarDocumento(numero: NumeroExpediente, documentoId: string) {
    return Promise.resolve(this.documentos.get(numero.valor)?.get(documentoId) ?? null);
  }
}

describe('Bandeja de expedientes del personal (historia 4 de la 004)', () => {
  let expedientes: ExpedientesEnMemoria;

  beforeEach(() => {
    expedientes = new ExpedientesEnMemoria();
  });

  describe('ListarExpedientes', () => {
    const listar = (cambios: Partial<FiltroBandeja> = {}) =>
      new ListarExpedientes(expedientes).ejecutar({
        estado: null,
        ruta: null,
        pagina: 1,
        porPagina: 20,
        ...cambios,
      });

    it('combina estado y ruta y ordena del más reciente al más antiguo', async () => {
      const pagina = await listar({ estado: 'REGISTRADO', ruta: 'B' });

      expect(pagina.datos.map((fila) => fila.numero)).toEqual([
        'EXP-2026-000004',
        'EXP-2026-000002',
      ]);
      expect(pagina).toMatchObject({ total: 2, pagina: 1, porPagina: 20 });
    });

    it('pagina los resultados', async () => {
      const segunda = await listar({ pagina: 2, porPagina: 3 });

      expect(segunda.total).toBe(4);
      expect(segunda.datos.map((fila) => fila.numero)).toEqual(['EXP-2026-000001']);
    });

    it.each([0, 51, 1.5])('porPagina %p está fuera de 1 a 50', async (porPagina) => {
      await expect(listar({ porPagina })).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
    });

    it('acepta los límites 1 y 50', async () => {
      expect((await listar({ porPagina: 1 })).datos).toHaveLength(1);
      expect((await listar({ porPagina: 50 })).datos).toHaveLength(4);
    });

    it('una página menor que 1 es inválida', async () => {
      await expect(listar({ pagina: 0 })).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
    });
  });

  describe('ObtenerDetalleExpediente', () => {
    const obtener = (numero: string) =>
      new ObtenerDetalleExpediente({ expedientes, reloj: new RelojFalso() }).ejecutar({
        numero,
        usuarioId: 'evaluador-1',
      });

    it('enmascara el documento del titular y no lo devuelve en claro', async () => {
      const detalle = await obtener('EXP-2026-000001');

      expect(detalle.documentoTitularEnmascarado).toBe('4*****21');
      expect(JSON.stringify(detalle)).not.toContain('40000021');
      expect(detalle.direccion).toBe('Jr. Ficticio 123');
    });

    it('registra VER_DETALLE con el usuario y la hora', async () => {
      await obtener('exp-2026-000001');

      expect(expedientes.vistas).toEqual([
        { numero: 'EXP-2026-000001', usuarioId: 'evaluador-1', en: T0 },
      ]);
    });

    it('como respuesta de una decisión (005) no registra VER_DETALLE', async () => {
      await new ObtenerDetalleExpediente({ expedientes, reloj: new RelojFalso() }).ejecutar({
        numero: 'EXP-2026-000001',
        usuarioId: 'evaluador-1',
        registrarVista: false,
      });

      expect(expedientes.vistas).toHaveLength(0);
    });

    it.each(['EXP-2026-999999', 'no-es-un-numero'])('%s → no encontrado', async (numero) => {
      await expect(obtener(numero)).rejects.toBeInstanceOf(ErrorExpedienteNoEncontrado);
      expect(expedientes.vistas).toHaveLength(0);
    });
  });

  describe('DescargarDocumento', () => {
    const almacen = new AlmacenFalso();
    const descargar = (numero: string, documentoId: string) =>
      new DescargarDocumento({ expedientes, almacen }).ejecutar({ numero, documentoId });

    beforeEach(async () => {
      await almacen.guardar('clave-1', new Uint8Array([1, 2, 3]));
    });

    it('entrega el archivo del expediente con su nombre y tipo', async () => {
      const archivo = await descargar('EXP-2026-000001', 'doc-1');

      expect(archivo).toEqual({
        nombreOriginal: 'solicitud.pdf',
        tipoMime: 'application/pdf',
        contenido: new Uint8Array([1, 2, 3]),
      });
    });

    it('un documento de otro expediente → no encontrado', async () => {
      await expect(descargar('EXP-2026-000002', 'doc-1')).rejects.toBeInstanceOf(
        ErrorExpedienteNoEncontrado,
      );
    });

    it('un número inválido → no encontrado', async () => {
      await expect(descargar('X', 'doc-1')).rejects.toBeInstanceOf(ErrorExpedienteNoEncontrado);
    });
  });

  describe('enmascararDocumento', () => {
    it.each([
      ['40000021', '4*****21'],
      ['000123456', '0******56'],
      ['123', '***'],
    ])('%s → %s', (documento, esperado) => {
      expect(enmascararDocumento(documento)).toBe(esperado);
    });
  });
});
