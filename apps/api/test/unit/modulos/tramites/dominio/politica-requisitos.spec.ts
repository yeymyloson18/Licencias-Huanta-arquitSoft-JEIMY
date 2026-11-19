import {
  clasificarRequisitos,
  revisarAdjuntos,
} from '../../../../../src/modulos/tramites/dominio/politica-requisitos';
import type {
  CondicionRequisito,
  RequisitoAlPresentar,
} from '../../../../../src/modulos/tramites/dominio/receta-al-presentar';
import { leerSemillaCatalogo } from '../../catalogo/apoyo/semilla-catalogo';

/** Las 9 licencias de datos-semilla.sql con `id` de requisito como los tendría la base. */
const licencias = (() => {
  let siguienteId = 1;
  return leerSemillaCatalogo()
    .filter((receta) => receta.tipo === 'LICENCIA')
    .map((receta) => ({
      codigo: receta.codigo,
      requisitos: receta.requisitos.map((requisito): RequisitoAlPresentar => ({
        id: siguienteId++,
        orden: requisito.orden,
        descripcion: requisito.descripcion,
        obligatorio: requisito.obligatorio,
        condicion: requisito.condicion as CondicionRequisito,
      })),
    }));
})();

const esperadaPara = (condicion: CondicionRequisito, conRepresentante: boolean) => {
  if (condicion === 'CON_REPRESENTANTE') {
    return conRepresentante ? 'OBLIGATORIO' : 'NO_APLICA';
  }
  return condicion === 'SIEMPRE' ? 'OBLIGATORIO' : 'OPCIONAL';
};

describe('Política de requisitos (FR-010 a FR-012, aclaración 3 y SC-006 de la 004)', () => {
  it('la semilla tiene las 9 licencias', () => {
    expect(licencias).toHaveLength(9);
  });

  describe.each(licencias)('$codigo', ({ requisitos }) => {
    it.each([false, true])(
      'con representante = %p pide exactamente los documentos de su receta',
      (conRepresentante) => {
        const clasificacion = clasificarRequisitos(requisitos, conRepresentante);

        expect(clasificacion.map((item) => item.requisito.id)).toEqual(
          [...requisitos].sort((a, b) => a.orden - b.orden).map((requisito) => requisito.id),
        );
        for (const { requisito, clase } of clasificacion) {
          expect({ id: requisito.id, clase }).toEqual({
            id: requisito.id,
            clase: esperadaPara(requisito.condicion, conRepresentante),
          });
        }
      },
    );

    it('sin adjuntos, cada obligatorio es un faltante', () => {
      const clasificacion = clasificarRequisitos(requisitos, false);
      const obligatorios = clasificacion.filter((item) => item.clase === 'OBLIGATORIO');

      expect(revisarAdjuntos(clasificacion, []).map((error) => error.campo)).toEqual(
        obligatorios.map((item) => `documentos.requisito.${String(item.requisito.id)}`),
      );
    });

    it('con todos los obligatorios adjuntos no hay errores', () => {
      const clasificacion = clasificarRequisitos(requisitos, false);
      const adjuntos = clasificacion
        .filter((item) => item.clase === 'OBLIGATORIO')
        .map((item, indice) => ({
          requisitoId: item.requisito.id,
          documentoId: `doc-${String(indice)}`,
        }));

      expect(revisarAdjuntos(clasificacion, adjuntos)).toEqual([]);
    });
  });

  const requisito = (
    id: number,
    condicion: CondicionRequisito,
    obligatorio = true,
  ): RequisitoAlPresentar => ({
    id,
    orden: id,
    descripcion: `R${String(id)}`,
    obligatorio,
    condicion,
  });
  const receta = [
    requisito(1, 'SIEMPRE'),
    requisito(2, 'CON_REPRESENTANTE'),
    requisito(3, 'GIRO_ESPECIAL'),
    requisito(4, 'SIEMPRE', false),
  ];

  it('un requisito SIEMPRE que el catálogo no marca obligatorio es opcional', () => {
    expect(clasificarRequisitos(receta, false)[3]?.clase).toBe('OPCIONAL');
  });

  it('rechaza un documento de un requisito que no aplica o no es de la receta', () => {
    const clasificacion = clasificarRequisitos(receta, false);

    expect(
      revisarAdjuntos(clasificacion, [
        { requisitoId: 1, documentoId: 'a' },
        { requisitoId: 2, documentoId: 'b' },
        { requisitoId: 99, documentoId: 'c' },
      ]),
    ).toEqual([
      { campo: 'documentos.requisito.2', mensaje: 'Este requisito no aplica a tu solicitud' },
      { campo: 'documentos.requisito.99', mensaje: 'No es un requisito de esta licencia' },
    ]);
  });

  it('rechaza dos documentos para el mismo requisito y el mismo documento en dos requisitos', () => {
    const clasificacion = clasificarRequisitos(receta, false);

    expect(
      revisarAdjuntos(clasificacion, [
        { requisitoId: 1, documentoId: 'a' },
        { requisitoId: 1, documentoId: 'b' },
        { requisitoId: 3, documentoId: 'a' },
      ]).map((error) => error.mensaje),
    ).toEqual([
      'Adjunta un solo documento por requisito',
      'El mismo documento está en otro requisito',
    ]);
  });

  it('con representante, la carta poder es obligatoria', () => {
    const clasificacion = clasificarRequisitos(receta, true);

    expect(revisarAdjuntos(clasificacion, [{ requisitoId: 1, documentoId: 'a' }])).toEqual([
      {
        campo: 'documentos.requisito.2',
        mensaje: 'Falta el documento de este requisito obligatorio',
      },
    ]);
  });
});
