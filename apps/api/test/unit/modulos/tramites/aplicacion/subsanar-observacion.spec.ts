import {
  ErrorExpedienteNoEncontrado,
  ErrorIdentidadNoConfirmada,
} from '../../../../../src/modulos/tramites/aplicacion/errores';
import {
  ErrorNoEsTitular,
  SubsanarObservacion,
} from '../../../../../src/modulos/tramites/aplicacion/subsanar-observacion';
import { ErrorValidacionSolicitud } from '../../../../../src/modulos/tramites/dominio/errores';
import { ErrorTransicionInvalida } from '../../../../../src/modulos/tramites/dominio/maquina-estados';
import type {
  ExpedienteParaSubsanar,
  RepositorioSubsanacion,
  Subsanacion,
} from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-subsanacion';
import type { IdentidadSolicitud } from '../../../../../src/modulos/tramites/dominio/puertos/verificador-identidad';
import { DocumentosTemporalesEnMemoria, RelojFalso, T0, VerificadorFalso } from '../apoyo/dobles';

// Datos FICTICIOS.
const IDENTIDAD: IdentidadSolicitud = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000001',
  ruc: '10400000011',
  celular: '987000001',
};
const VERIFICACION = '00000000-0000-4000-8000-0000000000a1';
const MESA = '00000000-0000-4000-8000-0000000000b2';
const DOC_1 = '00000000-0000-4000-8000-000000000d01';

const EXPEDIENTE: ExpedienteParaSubsanar = {
  id: 'exp-1',
  numero: 'EXP-2026-000001',
  estado: 'OBSERVADO',
  version: 4,
  ruta: 'A',
  codigoReceta: 'LIC-02',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  canal: 'EN_LINEA',
  presentadoEn: T0,
  vencePlazoEn: null,
  requisitos: [
    { id: 11, orden: 1 },
    { id: 13, orden: 3 },
  ],
};

class SubsanacionEnMemoria implements RepositorioSubsanacion {
  expediente: ExpedienteParaSubsanar | null = EXPEDIENTE;
  resultado: Awaited<ReturnType<RepositorioSubsanacion['subsanar']>> = 'SUBSANADO';
  readonly guardadas: Subsanacion[] = [];
  obtener() {
    return Promise.resolve(this.expediente);
  }
  esDelTitular(_numero: string, documento: string) {
    return Promise.resolve(documento === '40000001');
  }
  subsanar(datos: Subsanacion) {
    this.guardadas.push(datos);
    return Promise.resolve(this.resultado);
  }
}

describe('SubsanarObservacion (historia 4 de la 005)', () => {
  let repositorio: SubsanacionEnMemoria;
  let verificador: VerificadorFalso;
  let documentos: DocumentosTemporalesEnMemoria;
  let reloj: RelojFalso;

  const subir = (id: string, dueno: { verificacionId?: string; usuarioId?: string }) => {
    documentos.documentos.set(id, {
      id,
      claveAlmacen: `temporales/${id}`,
      nombreOriginal: 'croquis.pdf',
      tipoMime: 'application/pdf',
      tamanoBytes: 10,
      sha256: 'a'.repeat(64),
      verificacionId: dueno.verificacionId ?? null,
      usuarioId: dueno.usuarioId ?? null,
      subidoEn: T0,
    });
  };

  const enLinea = (identidad: IdentidadSolicitud | null = IDENTIDAD, requisitoId = 13) =>
    new SubsanarObservacion({ repositorio, verificador, documentos, reloj }).ejecutar({
      numero: 'EXP-2026-000001',
      canal: { tipo: 'EN_LINEA', verificacionId: VERIFICACION },
      identidad,
      documentos: [{ requisitoId, documentoId: DOC_1 }],
    });

  const errorDe = async (promesa: Promise<unknown>) => {
    try {
      await promesa;
    } catch (error) {
      return error;
    }
    throw new Error('esperaba un error');
  };

  beforeEach(() => {
    repositorio = new SubsanacionEnMemoria();
    verificador = new VerificadorFalso();
    documentos = new DocumentosTemporalesEnMemoria();
    reloj = new RelojFalso();
    subir(DOC_1, { verificacionId: VERIFICACION });
  });

  it('en línea, el titular subsana y el expediente vuelve a EN_EVALUACION', async () => {
    const resultado = await enLinea();

    expect(resultado).toMatchObject({ numero: 'EXP-2026-000001', estado: 'EN_EVALUACION' });
    expect(repositorio.guardadas).toEqual([
      {
        expedienteId: 'exp-1',
        numero: 'EXP-2026-000001',
        versionEsperada: 4,
        documentos: [{ documentoId: DOC_1, requisitoId: 13, requisitoOrden: 3 }],
        usuarioId: null,
        en: T0,
      },
    ]);
  });

  it('con la identidad de otra persona responde sin datos y no guarda', async () => {
    const error = await errorDe(
      enLinea({ ...IDENTIDAD, numeroDocumento: '40000002', ruc: '10400000029' }),
    );

    expect(error).toBeInstanceOf(ErrorNoEsTitular);
    expect(String((error as Error).message)).not.toMatch(/4000000/);
    expect(repositorio.guardadas).toEqual([]);
  });

  it('la identidad que no es la confirmada con el código se rechaza', async () => {
    verificador.resultado = { tipo: 'NO_CONFIRMADA' };

    await expect(enLinea()).rejects.toBeInstanceOf(ErrorIdentidadNoConfirmada);
  });

  it('en línea sin identidad, o con datos inválidos, es un error de validación', async () => {
    await expect(enLinea(null)).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
    verificador.resultado = { tipo: 'DATOS_INVALIDOS', campos: ['celular'] };
    await expect(enLinea()).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
  });

  it('mesa de partes subsana sin identidad con sus documentos', async () => {
    subir('00000000-0000-4000-8000-000000000d02', { usuarioId: MESA });

    await new SubsanarObservacion({ repositorio, verificador, documentos, reloj }).ejecutar({
      numero: 'EXP-2026-000001',
      canal: { tipo: 'MESA_PARTES', usuarioId: MESA },
      identidad: null,
      documentos: [{ requisitoId: 11, documentoId: '00000000-0000-4000-8000-000000000d02' }],
    });

    expect(repositorio.guardadas[0]).toMatchObject({ usuarioId: MESA });
  });

  it('sin documentos es un error', async () => {
    const error = await errorDe(
      new SubsanarObservacion({ repositorio, verificador, documentos, reloj }).ejecutar({
        numero: 'EXP-2026-000001',
        canal: { tipo: 'MESA_PARTES', usuarioId: MESA },
        identidad: null,
        documentos: [],
      }),
    );

    expect((error as ErrorValidacionSolicitud).errores).toEqual([
      { campo: 'documentos', mensaje: 'Adjunta al menos un documento' },
    ]);
  });

  it('un requisito que no es de la receta guardada es un error', async () => {
    const error = await errorDe(enLinea(IDENTIDAD, 99));

    expect((error as ErrorValidacionSolicitud).errores[0]).toEqual({
      campo: 'documentos.requisito.99',
      mensaje: 'Este requisito no es de la licencia del expediente',
    });
  });

  it('un documento ajeno o vencido es un error', async () => {
    documentos.documentos.clear();
    subir(DOC_1, { verificacionId: '00000000-0000-4000-8000-0000000000ff' });
    const ajeno = await errorDe(enLinea());
    expect((ajeno as ErrorValidacionSolicitud).errores[0]?.mensaje).toBe(
      'El documento no está disponible. Vuelve a subirlo',
    );

    documentos.documentos.clear();
    subir(DOC_1, { verificacionId: VERIFICACION });
    reloj.avanzar(25 * 60 * 60);
    const vencido = await errorDe(enLinea());
    expect((vencido as ErrorValidacionSolicitud).errores[0]?.mensaje).toBe(
      'El documento venció (más de 24 horas). Vuelve a subirlo',
    );
  });

  it('un expediente que no está OBSERVADO es una transición inválida', async () => {
    repositorio.expediente = { ...EXPEDIENTE, estado: 'REGISTRADO' };

    await expect(enLinea()).rejects.toBeInstanceOf(ErrorTransicionInvalida);
  });

  it('si otra subsanación ganó la carrera, es una transición inválida', async () => {
    repositorio.resultado = 'CAMBIO';

    await expect(enLinea()).rejects.toBeInstanceOf(ErrorTransicionInvalida);
  });

  it('si el documento ya no está al guardar, es un error de validación', async () => {
    repositorio.resultado = 'DOCUMENTOS_NO_DISPONIBLES';

    await expect(enLinea()).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
  });

  it('un expediente inexistente no se encuentra', async () => {
    repositorio.expediente = null;

    await expect(enLinea()).rejects.toBeInstanceOf(ErrorExpedienteNoEncontrado);
  });
});
