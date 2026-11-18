import type {
  CambioRequisito,
  CambiosReceta,
} from '../../../../../src/modulos/catalogo/dominio/cambios-receta';
import { ErrorValidacionReceta } from '../../../../../src/modulos/catalogo/dominio/error-validacion-receta';
import { aplicarCambios } from '../../../../../src/modulos/catalogo/dominio/aplicar-cambios';
import {
  crearRecetaCompleta,
  type RecetaCompleta,
} from '../../../../../src/modulos/catalogo/dominio/receta-completa';
import { leerSemillaCatalogo } from '../apoyo/semilla-catalogo';

// Recetas de datos-semilla.sql con `id` de requisito como los tendría la base (100, 101, … por receta).
const receta = (codigo: string): RecetaCompleta => {
  const indice = leerSemillaCatalogo().findIndex((datos) => datos.codigo === codigo);
  const datos = leerSemillaCatalogo()[indice];
  if (!datos) {
    throw new Error(`No existe ${codigo} en la semilla`);
  }
  return crearRecetaCompleta({
    ...datos,
    requisitos: datos.requisitos.map((requisito, posicion) => ({
      ...requisito,
      id: (indice + 1) * 100 + posicion,
    })),
  });
};

/** La lista de requisitos de la receta como cuerpo de edición, con sus `id`. */
const comoCambio = (original: RecetaCompleta): CambioRequisito[] =>
  original.requisitos.map((requisito) => ({
    id: requisito.id ?? undefined,
    descripcion: requisito.descripcion,
    obligatorio: requisito.obligatorio,
    condicion: requisito.condicion,
  }));

/** Ejecuta `aplicarCambios` esperando un rechazo y devuelve los campos con error. */
const camposRechazados = (original: RecetaCompleta, cambios: CambiosReceta): string[] => {
  try {
    aplicarCambios(original, cambios);
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorValidacionReceta);
    return (error as ErrorValidacionReceta).errores.map((falla) => falla.campo);
  }
  throw new Error('Se esperaba ErrorValidacionReceta');
};

describe('aplicarCambios (receta editable, FR-017 a FR-020)', () => {
  describe('diferencias', () => {
    it('la tasa 177.10 → 180.00 da su antes y después', () => {
      const { receta: nueva, diferencias } = aplicarCambios(receta('LIC-02'), { tasa: '180.00' });

      expect(diferencias).toEqual({ tasa: { antes: '177.10', despues: '180.00' } });
      expect(nueva.tasa.aTextoSoles()).toBe('180.00');
    });

    it('los mismos valores dan diferencias vacías y la misma receta en contenido', () => {
      const original = receta('LIC-02');

      const { receta: nueva, diferencias } = aplicarCambios(original, {
        tasa: '177.10',
        plazoDias: 2,
        calificacion: 'APROBACION_AUTOMATICA',
        ordenItse: 'POSTERIOR',
        plazoItseDias: 9,
        vigenciaMeses: null,
        activa: true,
        requisitos: comoCambio(original),
      });

      expect(diferencias).toEqual({});
      expect(nueva.requisitos).toBe(original.requisitos);
    });

    it('la vigencia null → 12 se detecta', () => {
      expect(aplicarCambios(receta('LIC-01'), { vigenciaMeses: 12 }).diferencias).toEqual({
        vigenciaMeses: { antes: null, despues: 12 },
      });
    });

    it('el estado activa también es un campo editable', () => {
      expect(aplicarCambios(receta('LIC-06'), { activa: false }).diferencias).toEqual({
        activa: { antes: true, despues: false },
      });
    });

    it('los requisitos reemplazan la lista y el orden final es la posición, ignorando el recibido', () => {
      const original = receta('LIC-01');
      const lista = comoCambio(original);
      const [primero, segundo, tercero, ...resto] = lista;
      if (!primero || !segundo || !tercero) throw new Error('LIC-01 tiene al menos 3 requisitos');
      const conOrden = { ...tercero, orden: 99 } as CambioRequisito;

      const { receta: nueva } = aplicarCambios(original, {
        requisitos: [conOrden, primero, segundo, ...resto],
      });

      expect(nueva.requisitos.map((requisito) => requisito.orden)).toEqual(
        lista.map((_, posicion) => posicion + 1),
      );
      expect(nueva.requisitos.map((requisito) => requisito.id)).toEqual([
        tercero.id,
        primero.id,
        segundo.id,
        ...resto.map((requisito) => requisito.id),
      ]);
    });

    it('un requisito con id conserva su id y uno sin id queda como nuevo', () => {
      const original = receta('LIC-09');
      const lista = comoCambio(original);

      const { receta: nueva } = aplicarCambios(original, {
        requisitos: [
          ...lista,
          { descripcion: 'Conformidad de zonificación', condicion: 'SIEMPRE' },
        ],
      });

      expect(nueva.requisitos.map((requisito) => requisito.id)).toEqual([
        ...lista.map((requisito) => requisito.id),
        null,
      ]);
      expect(nueva.requisitos.at(-1)).toMatchObject({ orden: 3, obligatorio: true });
    });

    it('la diferencia de requisitos lleva las listas completas sin id', () => {
      const original = receta('LIC-09');
      const [primero] = comoCambio(original);
      if (!primero) throw new Error('LIC-09 tiene requisitos');

      const { diferencias } = aplicarCambios(original, {
        requisitos: [{ ...primero, obligatorio: false }],
      });

      expect(diferencias.requisitos).toEqual({
        antes: [
          {
            orden: 1,
            descripcion: 'Solicitud de licencia provisional con declaración jurada',
            obligatorio: true,
            condicion: 'SIEMPRE',
          },
          {
            orden: 2,
            descripcion: 'Declaración jurada de condiciones de seguridad de la bodega',
            obligatorio: true,
            condicion: 'SIEMPRE',
          },
        ],
        despues: [
          {
            orden: 1,
            descripcion: 'Solicitud de licencia provisional con declaración jurada',
            obligatorio: false,
            condicion: 'SIEMPRE',
          },
        ],
      });
    });

    it('recorta los espacios al inicio y al final de una descripción', () => {
      const original = receta('LIC-09');
      const [primero, segundo] = comoCambio(original);
      if (!primero || !segundo) throw new Error('LIC-09 tiene 2 requisitos');

      const { receta: nueva, diferencias } = aplicarCambios(original, {
        requisitos: [{ ...primero, descripcion: `  ${primero.descripcion}  ` }, segundo],
      });

      expect(nueva.requisitos[0]?.descripcion).toBe(primero.descripcion);
      expect(diferencias).toEqual({});
    });

    it('la receta original no cambia (función pura)', () => {
      const original = receta('LIC-02');

      aplicarCambios(original, { tasa: '200.00' });

      expect(original.tasa.aTextoSoles()).toBe('177.10');
    });
  });

  describe('rechazos (todos los errores a la vez)', () => {
    it.each(['-1.00', '1.005', 'abc', '100000000.00'])('rechaza la tasa %s', (tasa) => {
      expect(camposRechazados(receta('LIC-02'), { tasa })).toEqual(['tasa']);
    });

    it('acepta la tasa máxima 99999999.99', () => {
      expect(
        aplicarCambios(receta('LIC-02'), { tasa: '99999999.99' }).receta.tasa.aTextoSoles(),
      ).toBe('99999999.99');
    });

    it.each([
      [{ plazoDias: 0 }, 'plazoDias'],
      [{ plazoDias: 1.5 }, 'plazoDias'],
      [{ plazoItseDias: 0 }, 'plazoItseDias'],
      [{ vigenciaMeses: 0 }, 'vigenciaMeses'],
      [{ calificacion: 'OTRA' }, 'calificacion'],
      [{ ordenItse: 'NUNCA' }, 'ordenItse'],
    ])('rechaza %o en el campo %s', (cambios, campo) => {
      expect(camposRechazados(receta('LIC-02'), cambios)).toEqual([campo]);
    });

    it('rechaza una lista de requisitos vacía', () => {
      expect(camposRechazados(receta('LIC-02'), { requisitos: [] })).toEqual(['requisitos']);
    });

    it('rechaza 31 requisitos', () => {
      const requisitos = Array.from({ length: 31 }, (_, indice) => ({
        descripcion: `Requisito ${String(indice + 1)}`,
        condicion: 'SIEMPRE',
      }));
      expect(camposRechazados(receta('LIC-02'), { requisitos })).toEqual(['requisitos']);
    });

    it('acepta 30 requisitos', () => {
      const requisitos = Array.from({ length: 30 }, (_, indice) => ({
        descripcion: `Requisito ${String(indice + 1)}`,
        condicion: 'SIEMPRE',
      }));
      expect(aplicarCambios(receta('LIC-02'), { requisitos }).receta.requisitos).toHaveLength(30);
    });

    it.each([
      ['vacía tras recortar', '   '],
      ['de 501 caracteres', 'a'.repeat(501)],
    ])('rechaza una descripción %s', (_, descripcion) => {
      expect(
        camposRechazados(receta('LIC-02'), {
          requisitos: [{ descripcion, condicion: 'SIEMPRE' }],
        }),
      ).toEqual(['requisitos[0].descripcion']);
    });

    it('rechaza una condición que no está en la lista', () => {
      expect(
        camposRechazados(receta('LIC-02'), {
          requisitos: [{ descripcion: 'Algo', condicion: 'A_VECES' }],
        }),
      ).toEqual(['requisitos[0].condicion']);
    });

    it('rechaza un id que no pertenece a la receta', () => {
      const ajeno = receta('LIC-03').requisitos[0]?.id ?? 0;

      expect(
        camposRechazados(receta('LIC-02'), {
          requisitos: [{ id: ajeno, descripcion: 'Algo', condicion: 'SIEMPRE' }],
        }),
      ).toEqual(['requisitos[0].id']);
    });

    it('rechaza un id repetido', () => {
      const [primero] = comoCambio(receta('LIC-02'));
      if (!primero) throw new Error('LIC-02 tiene requisitos');

      expect(camposRechazados(receta('LIC-02'), { requisitos: [primero, primero] })).toEqual([
        'requisitos[1].id',
      ]);
    });

    it.each([
      [
        'ruta A con EVALUACION_PREVIA_SILENCIO_POSITIVO',
        'LIC-01',
        { calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO' },
        'calificacion',
      ],
      ['una licencia con ordenItse=null', 'LIC-03', { ordenItse: null }, 'ordenItse'],
      ['un trámite conectado con vigenciaMeses', 'TRF-01', { vigenciaMeses: 12 }, 'vigenciaMeses'],
    ] as const)('rechaza %s', (_, codigo, cambios, campo) => {
      expect(camposRechazados(receta(codigo), cambios)).toEqual([campo]);
    });

    it('un campo con error de valor no repite el error de coherencia', () => {
      expect(camposRechazados(receta('LIC-01'), { plazoItseDias: 0 })).toEqual(['plazoItseDias']);
    });

    it('informa todos los errores juntos, cada uno con su campo', () => {
      expect(
        camposRechazados(receta('LIC-02'), {
          tasa: '-1.00',
          plazoDias: 0,
          vigenciaMeses: 0,
          calificacion: 'SERVICIO_EXCLUSIVO',
          requisitos: [],
        }),
      ).toEqual(['tasa', 'plazoDias', 'vigenciaMeses', 'requisitos', 'calificacion']);
    });

    it('los mensajes no repiten el valor recibido', () => {
      try {
        aplicarCambios(receta('LIC-02'), { tasa: 'valor-secreto' });
      } catch (error) {
        expect(JSON.stringify((error as ErrorValidacionReceta).errores)).not.toContain(
          'valor-secreto',
        );
      }
      expect.assertions(1);
    });
  });
});
