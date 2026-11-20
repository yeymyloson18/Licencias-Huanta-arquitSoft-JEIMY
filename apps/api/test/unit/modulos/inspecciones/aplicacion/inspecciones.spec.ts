import {
  AsignarInspector,
  CrearInspeccion,
  ErrorInspeccionNoEncontrada,
  ListarInspecciones,
  RegistrarResultado,
} from '../../../../../src/modulos/inspecciones/aplicacion/inspecciones';
import {
  type DatosInspeccion,
  ErrorDatoInspeccion,
  ErrorInspeccionYaRegistrada,
  ErrorNoEsInspectorAsignado,
  Inspeccion,
} from '../../../../../src/modulos/inspecciones/dominio/inspeccion';
import type {
  FotoGuardada,
  RepositorioInspecciones,
} from '../../../../../src/modulos/inspecciones/dominio/puertos';

// Datos FICTICIOS.
const INSPECTOR = '00000000-0000-4000-8000-0000000000a1';
const JEFATURA = '00000000-0000-4000-8000-0000000000b1';
const EN = new Date('2026-11-20T15:00:00.000Z');
const reloj = { ahora: () => EN };
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1]);

const base = (cambios: Partial<DatosInspeccion> = {}): DatosInspeccion => ({
  id: 'ins-1',
  numeroExpediente: 'EXP-2026-000001',
  tipo: 'PREVIA',
  estado: 'ASIGNADA',
  inspectorId: INSPECTOR,
  programadaPara: '2026-11-20',
  resultado: null,
  observaciones: null,
  numeroCertificado: null,
  certificadoEmitidoEn: null,
  registradaEn: null,
  ...cambios,
});

class InspeccionesEnMemoria implements RepositorioInspecciones {
  inspecciones = new Map<string, Inspeccion>([['ins-1', Inspeccion.reconstruir(base())]]);
  creadas: string[] = [];
  asignaciones: { usuarioId: string }[] = [];
  fotos: readonly FotoGuardada[] = [];
  /** Simula que otro registro ganó la carrera. */
  rechazar: 'NO' | 'REALIZADA' | 'REASIGNADA' = 'NO';
  falla = false;

  crearSiNoExiste(numero: string, tipo: string) {
    this.creadas.push(`${numero}:${tipo}`);
    return Promise.resolve(true);
  }
  obtener(id: string) {
    return Promise.resolve(this.inspecciones.get(id) ?? null);
  }
  listar() {
    const datos = [...this.inspecciones.values()];
    return Promise.resolve({ total: datos.length, datos });
  }
  asignar(inspeccion: Inspeccion, usuarioId: string) {
    if (this.rechazar !== 'NO') {
      return Promise.resolve(false);
    }
    this.asignaciones.push({ usuarioId });
    this.inspecciones.set(inspeccion.id, inspeccion);
    return Promise.resolve(true);
  }
  registrarResultado(inspeccion: Inspeccion, fotos: readonly FotoGuardada[]) {
    if (this.falla) {
      return Promise.reject(new Error('base caída'));
    }
    if (this.rechazar === 'REALIZADA') {
      this.inspecciones.set(
        'ins-1',
        Inspeccion.reconstruir(base({ estado: 'REALIZADA', resultado: 'FAVORABLE' })),
      );
      return Promise.resolve(false);
    }
    if (this.rechazar === 'REASIGNADA') {
      this.inspecciones.set('ins-1', Inspeccion.reconstruir(base({ inspectorId: 'otro' })));
      return Promise.resolve(false);
    }
    this.fotos = fotos;
    this.inspecciones.set(inspeccion.id, inspeccion);
    return Promise.resolve(true);
  }
}

class AlmacenEnMemoria {
  readonly archivos = new Map<string, Uint8Array>();
  guardar(clave: string, contenido: Uint8Array) {
    this.archivos.set(clave, contenido);
    return Promise.resolve();
  }
  leer(clave: string) {
    return Promise.resolve(this.archivos.get(clave) ?? new Uint8Array());
  }
  borrar(clave: string) {
    this.archivos.delete(clave);
    return Promise.resolve();
  }
}

describe('Casos de uso de inspecciones (historia 2 de la 006)', () => {
  let repositorio: InspeccionesEnMemoria;
  let almacen: AlmacenEnMemoria;
  let contador: number;

  beforeEach(() => {
    repositorio = new InspeccionesEnMemoria();
    almacen = new AlmacenEnMemoria();
    contador = 0;
  });

  const registrar = (cambios: Partial<Parameters<RegistrarResultado['ejecutar']>[0]> = {}) =>
    new RegistrarResultado({
      inspecciones: repositorio,
      almacen,
      ids: { nuevoId: () => `00000000-0000-4000-8000-00000000000${String((contador += 1))}` },
      reloj,
    }).ejecutar({
      inspeccionId: 'ins-1',
      inspectorId: INSPECTOR,
      resultado: 'FAVORABLE',
      observaciones: null,
      numeroCertificado: 'ITSE-001',
      certificadoEmitidoEn: '2026-11-19',
      fotos: [{ contenido: JPG }, { contenido: PNG }],
      ...cambios,
    });

  it('CrearInspeccion delega en el repositorio (una por expediente y tipo)', async () => {
    await new CrearInspeccion(repositorio).ejecutar({
      numeroExpediente: 'EXP-2026-000002',
      tipo: 'POSTERIOR',
    });

    expect(repositorio.creadas).toEqual(['EXP-2026-000002:POSTERIOR']);
  });

  describe('AsignarInspector', () => {
    const asignar = (inspectorId = INSPECTOR, programadaPara = '2026-11-21') =>
      new AsignarInspector({
        inspecciones: repositorio,
        personal: {
          inspectoresActivos: () => Promise.resolve([{ id: INSPECTOR, nombre: 'Inspector' }]),
        },
        reloj,
      }).ejecutar({ inspeccionId: 'ins-1', inspectorId, programadaPara, usuarioId: JEFATURA });

    it('asigna un inspector activo con una fecha no pasada', async () => {
      const datos = await asignar();

      expect(datos).toMatchObject({ estado: 'ASIGNADA', programadaPara: '2026-11-21' });
      expect(repositorio.asignaciones).toEqual([{ usuarioId: JEFATURA }]);
    });

    it('un usuario que no es inspector activo es un dato inválido', async () => {
      await expect(asignar('otro')).rejects.toBeInstanceOf(ErrorDatoInspeccion);
    });

    it('si se registró el resultado mientras tanto, ya está registrada', async () => {
      repositorio.rechazar = 'REALIZADA';

      await expect(asignar()).rejects.toBeInstanceOf(ErrorInspeccionYaRegistrada);
    });

    it('una inspección inexistente no se encuentra', async () => {
      repositorio.inspecciones.clear();

      await expect(asignar()).rejects.toBeInstanceOf(ErrorInspeccionNoEncontrada);
    });
  });

  describe('RegistrarResultado', () => {
    it('guarda las fotos y el resultado', async () => {
      const datos = await registrar();

      expect(datos).toMatchObject({ estado: 'REALIZADA', numeroCertificado: 'ITSE-001' });
      expect(repositorio.fotos.map((f) => f.tipoMime)).toEqual(['image/jpeg', 'image/png']);
      expect(almacen.archivos.size).toBe(2);
    });

    it('un archivo que no es imagen (aunque parezca) se rechaza sin guardar nada', async () => {
      await expect(registrar({ fotos: [{ contenido: PDF }] })).rejects.toBeInstanceOf(
        ErrorDatoInspeccion,
      );
      expect(almacen.archivos.size).toBe(0);
    });

    it('si la base falla, las fotos guardadas se borran', async () => {
      repositorio.falla = true;

      await expect(registrar()).rejects.toThrow('base caída');
      expect(almacen.archivos.size).toBe(0);
    });

    it('si otro registro ganó, responde ya registrada y borra las fotos', async () => {
      repositorio.rechazar = 'REALIZADA';

      await expect(registrar()).rejects.toBeInstanceOf(ErrorInspeccionYaRegistrada);
      expect(almacen.archivos.size).toBe(0);
    });

    it('si la reasignaron mientras tanto, ya no es el inspector asignado', async () => {
      repositorio.rechazar = 'REASIGNADA';

      await expect(registrar()).rejects.toBeInstanceOf(ErrorNoEsInspectorAsignado);
    });

    it('una inspección inexistente no se encuentra', async () => {
      repositorio.inspecciones.clear();

      await expect(registrar()).rejects.toBeInstanceOf(ErrorInspeccionNoEncontrada);
    });
  });

  describe('ListarInspecciones', () => {
    const listar = (esJefatura: boolean) =>
      new ListarInspecciones({
        inspecciones: repositorio,
        personal: {
          nombresDe: () => Promise.resolve(new Map([[INSPECTOR, 'Inspector de Prueba']])),
        },
        expedientes: {
          resumenes: () =>
            Promise.resolve(
              new Map([['EXP-2026-000001', { giro: 'Bodega', nombreLicencia: 'Riesgo alto' }]]),
            ),
          direccionDelLocal: () => Promise.resolve('Jr. Ficticio 123, Huanta'),
        },
      }).ejecutar({
        usuario: { id: INSPECTOR, esJefatura },
        estado: null,
        pagina: 1,
        porPagina: 20,
      });

    it('al inspector le muestra la dirección; a la jefatura, no', async () => {
      const inspector = await listar(false);
      const jefatura = await listar(true);

      expect(inspector.datos[0]).toMatchObject({
        giro: 'Bodega',
        nombreLicencia: 'Riesgo alto',
        nombreInspector: 'Inspector de Prueba',
        direccion: 'Jr. Ficticio 123, Huanta',
      });
      expect(jefatura.datos[0]).not.toHaveProperty('direccion');
      expect(jefatura).toMatchObject({ total: 1, pagina: 1, porPagina: 20 });
    });
  });
});
