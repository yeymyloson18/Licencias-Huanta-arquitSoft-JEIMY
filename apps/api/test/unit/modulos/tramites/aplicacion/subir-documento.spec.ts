import {
  ErrorArchivoDemasiadoGrande,
  ErrorTipoArchivoNoPermitido,
} from '../../../../../src/modulos/tramites/aplicacion/errores';
import {
  limpiarNombreArchivo,
  SubirDocumento,
} from '../../../../../src/modulos/tramites/aplicacion/subir-documento';
import { ErrorValidacionSolicitud } from '../../../../../src/modulos/tramites/dominio/errores';
import {
  AlmacenFalso,
  DocumentosTemporalesEnMemoria,
  HuellaFalsa,
  IdsFalsos,
  RelojFalso,
  T0,
} from '../apoyo/dobles';

const PDF = new TextEncoder().encode('%PDF-1.7 contenido');

const preparar = () => {
  const almacen = new AlmacenFalso();
  const documentos = new DocumentosTemporalesEnMemoria();
  const casoDeUso = new SubirDocumento({
    almacen,
    documentos,
    huella: new HuellaFalsa(),
    ids: new IdsFalsos(),
    reloj: new RelojFalso(),
  });
  return { casoDeUso, almacen, documentos };
};

describe('SubirDocumento (FR-013 y FR-014 de la 004)', () => {
  it('guarda el archivo con un nombre aleatorio y deja el temporal de quien lo subió', async () => {
    const { casoDeUso, almacen, documentos } = preparar();

    const subido = await casoDeUso.ejecutar({
      contenido: PDF,
      nombreOriginal: 'C:\\Users\\persona\\solicitud.pdf',
      subidoPor: { verificacionId: 'verificacion-1' },
    });

    expect(subido).toEqual({ documentoId: 'id-1', sha256: 'sha:%PDF-1.7 contenido' });
    expect([...almacen.archivos.keys()]).toEqual(['id-2']);
    expect(documentos.documentos.get('id-1')).toEqual({
      id: 'id-1',
      claveAlmacen: 'id-2',
      nombreOriginal: 'solicitud.pdf',
      tipoMime: 'application/pdf',
      tamanoBytes: PDF.length,
      sha256: 'sha:%PDF-1.7 contenido',
      verificacionId: 'verificacion-1',
      usuarioId: null,
      subidoEn: T0,
    });
  });

  it('en mesa de partes guarda el usuario que lo subió', async () => {
    const { casoDeUso, documentos } = preparar();

    await casoDeUso.ejecutar({
      contenido: PDF,
      nombreOriginal: 'a.pdf',
      subidoPor: { usuarioId: 'u-1' },
    });

    expect(documentos.documentos.get('id-1')).toMatchObject({
      usuarioId: 'u-1',
      verificacionId: null,
    });
  });

  it('rechaza un archivo de más de 10 MB', async () => {
    const { casoDeUso, almacen } = preparar();
    const grande = new Uint8Array(10 * 1024 * 1024 + 1);
    grande.set(PDF);

    await expect(
      casoDeUso.ejecutar({
        contenido: grande,
        nombreOriginal: 'a.pdf',
        subidoPor: { usuarioId: 'u' },
      }),
    ).rejects.toBeInstanceOf(ErrorArchivoDemasiadoGrande);
    expect(almacen.archivos.size).toBe(0);
  });

  it('rechaza un archivo que no es PDF, JPG ni PNG aunque se llame .pdf', async () => {
    const { casoDeUso } = preparar();

    await expect(
      casoDeUso.ejecutar({
        contenido: new TextEncoder().encode('no soy un pdf'),
        nombreOriginal: 'falso.pdf',
        subidoPor: { usuarioId: 'u' },
      }),
    ).rejects.toBeInstanceOf(ErrorTipoArchivoNoPermitido);
  });

  it('rechaza un archivo vacío', async () => {
    const { casoDeUso } = preparar();

    await expect(
      casoDeUso.ejecutar({
        contenido: new Uint8Array(),
        nombreOriginal: 'a.pdf',
        subidoPor: { usuarioId: 'u' },
      }),
    ).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
  });

  it('si no se puede guardar la fila, borra el archivo', async () => {
    const { casoDeUso, almacen, documentos } = preparar();
    documentos.falla = true;

    await expect(
      casoDeUso.ejecutar({
        contenido: PDF,
        nombreOriginal: 'a.pdf',
        subidoPor: { usuarioId: 'u' },
      }),
    ).rejects.toThrow('base caída');
    expect(almacen.archivos.size).toBe(0);
  });

  it.each([
    ['../../etc/passwd', 'passwd'],
    ['nombre\u0000con\u0007control.pdf', 'nombreconcontrol.pdf'],
    ['   ', 'documento'],
    ['a'.repeat(300), 'a'.repeat(255)],
  ])('limpia el nombre %p', (nombre, esperado) => {
    expect(limpiarNombreArchivo(nombre)).toBe(esperado);
  });
});
