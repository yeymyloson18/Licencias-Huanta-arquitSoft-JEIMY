import type { AlmacenArchivos } from '../dominio/puertos/almacen-archivos';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioDocumentosTemporales } from '../dominio/puertos/repositorio-documentos-temporales';

/** Un documento que no se usó en ninguna solicitud vence a las 24 horas (FR-014). */
export const VIDA_DOCUMENTO_TEMPORAL_MS = 24 * 60 * 60 * 1000;
/** Cuántos se descartan por pasada, para no tener una transacción enorme. */
export const LOTE_DESCARTE = 500;

/**
 * Borra los documentos temporales de más de 24 horas: primero el archivo y después la fila (si el
 * archivo ya no estaba, igual se borra la fila). Los documentos que pasaron a un expediente ya no
 * están en `documento_temporal`, así que nunca se tocan. Devuelve solo cuántos borró (research §R-09).
 */
export class DescartarDocumentosVencidos {
  constructor(
    private readonly dependencias: {
      readonly documentos: Pick<RepositorioDocumentosTemporales, 'listarVencidos' | 'borrar'>;
      readonly almacen: Pick<AlmacenArchivos, 'borrar'>;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(): Promise<number> {
    const { documentos, almacen, reloj } = this.dependencias;
    const limite = new Date(reloj.ahora().getTime() - VIDA_DOCUMENTO_TEMPORAL_MS);
    let total = 0;
    for (;;) {
      const vencidos = await documentos.listarVencidos(limite, LOTE_DESCARTE);
      if (vencidos.length === 0) {
        return total;
      }
      for (const documento of vencidos) {
        await almacen.borrar(documento.claveAlmacen);
      }
      await documentos.borrar(vencidos.map((documento) => documento.id));
      total += vencidos.length;
      if (vencidos.length < LOTE_DESCARTE) {
        return total;
      }
    }
  }
}
