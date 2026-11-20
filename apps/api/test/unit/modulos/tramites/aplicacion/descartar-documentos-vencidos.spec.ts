import {
  DescartarDocumentosVencidos,
  LOTE_DESCARTE,
} from '../../../../../src/modulos/tramites/aplicacion/descartar-documentos-vencidos';
import type { DocumentoTemporal } from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-documentos-temporales';
import { AlmacenFalso, DocumentosTemporalesEnMemoria, RelojFalso, T0 } from '../apoyo/dobles';

const HORA = 60 * 60 * 1000;

const documento = (id: string, horasAntes: number): DocumentoTemporal => ({
  id,
  claveAlmacen: `clave-${id}`,
  nombreOriginal: `${id}.pdf`,
  tipoMime: 'application/pdf',
  tamanoBytes: 10,
  sha256: 'a'.repeat(64),
  verificacionId: 'verificacion-1',
  usuarioId: null,
  subidoEn: new Date(T0.getTime() - horasAntes * HORA),
});

describe('DescartarDocumentosVencidos (FR-014, research §R-09 de la 004)', () => {
  const preparar = async (documentos: DocumentoTemporal[]) => {
    const repositorio = new DocumentosTemporalesEnMemoria();
    const almacen = new AlmacenFalso();
    for (const doc of documentos) {
      repositorio.documentos.set(doc.id, doc);
      await almacen.guardar(doc.claveAlmacen, new Uint8Array([1]));
    }
    const caso = new DescartarDocumentosVencidos({
      documentos: repositorio,
      almacen,
      reloj: new RelojFalso(),
    });
    return { caso, repositorio, almacen };
  };

  it('borra el archivo y la fila de los de más de 24 h y conserva los recientes', async () => {
    const { caso, repositorio, almacen } = await preparar([
      documento('viejo', 25),
      documento('reciente', 1),
    ]);

    expect(await caso.ejecutar()).toBe(1);
    expect([...repositorio.documentos.keys()]).toEqual(['reciente']);
    expect([...almacen.archivos.keys()]).toEqual(['clave-reciente']);
  });

  it('justo a las 24 h todavía no vence', async () => {
    const { caso, repositorio } = await preparar([documento('limite', 24)]);

    expect(await caso.ejecutar()).toBe(0);
    expect(repositorio.documentos.size).toBe(1);
  });

  it('sin vencidos no borra nada', async () => {
    const { caso } = await preparar([]);

    expect(await caso.ejecutar()).toBe(0);
  });

  it('si el archivo ya no estaba, igual borra la fila', async () => {
    const { caso, repositorio, almacen } = await preparar([documento('huerfano', 30)]);
    almacen.archivos.clear();

    expect(await caso.ejecutar()).toBe(1);
    expect(repositorio.documentos.size).toBe(0);
  });

  it('trabaja por lotes hasta terminar', async () => {
    const muchos = Array.from({ length: LOTE_DESCARTE + 3 }, (_, i) =>
      documento(`d${String(i)}`, 30),
    );
    const { caso, repositorio } = await preparar(muchos);

    expect(await caso.ejecutar()).toBe(LOTE_DESCARTE + 3);
    expect(repositorio.documentos.size).toBe(0);
  });
});
