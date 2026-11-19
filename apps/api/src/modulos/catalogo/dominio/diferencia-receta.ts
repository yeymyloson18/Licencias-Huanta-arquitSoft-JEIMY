import { CAMPOS_EDITABLES, type CampoEditable } from './cambios-receta';
import type { RecetaCompleta } from './receta-completa';
import type { Requisito } from './requisito';

// Diferencia entre dos versiones de una receta (research §R-05 de la 003). Es lo que se guarda en
// `catalogo.cambio_receta.cambios`: `{ "<campo>": { "antes": …, "despues": … } }`. Para los requisitos
// se guarda la lista completa, sin `id`, antes y después.

/** Requisito tal como queda en el registro de cambios (sin `id`). */
export interface RequisitoRegistrado {
  readonly orden: number;
  readonly descripcion: string;
  readonly obligatorio: boolean;
  readonly condicion: string;
}

export type ValorRegistrado = string | number | boolean | null | readonly RequisitoRegistrado[];

export interface CambioCampo {
  readonly antes: ValorRegistrado;
  readonly despues: ValorRegistrado;
}

/** Vacía si no hubo cambios reales (FR-022). */
export type DiferenciaReceta = Readonly<Partial<Record<CampoEditable, CambioCampo>>>;

export const aRequisitosRegistrados = (requisitos: readonly Requisito[]): RequisitoRegistrado[] =>
  requisitos.map((requisito) => ({
    orden: requisito.orden,
    descripcion: requisito.descripcion,
    obligatorio: requisito.obligatorio,
    condicion: requisito.condicion,
  }));

const mismosRequisitos = (
  primeros: readonly RequisitoRegistrado[],
  segundos: readonly RequisitoRegistrado[],
): boolean =>
  primeros.length === segundos.length &&
  primeros.every((requisito, indice) => {
    const otro = segundos[indice];
    return (
      otro !== undefined &&
      requisito.orden === otro.orden &&
      requisito.descripcion === otro.descripcion &&
      requisito.obligatorio === otro.obligatorio &&
      requisito.condicion === otro.condicion
    );
  });

/** Valor comparable y registrable de cada campo; la tasa se compara en céntimos. */
const valorDe = (receta: RecetaCompleta, campo: CampoEditable): ValorRegistrado => {
  switch (campo) {
    case 'tasa':
      return receta.tasa.aTextoSoles();
    case 'plazoDias':
      return receta.plazoDias?.dias ?? null;
    case 'requisitos':
      return aRequisitosRegistrados(receta.requisitos);
    default:
      return receta[campo];
  }
};

const iguales = (antes: RecetaCompleta, despues: RecetaCompleta, campo: CampoEditable): boolean => {
  if (campo === 'tasa') {
    return antes.tasa.esIgualA(despues.tasa);
  }
  if (campo === 'requisitos') {
    return mismosRequisitos(
      aRequisitosRegistrados(antes.requisitos),
      aRequisitosRegistrados(despues.requisitos),
    );
  }
  return valorDe(antes, campo) === valorDe(despues, campo);
};

/** Compara por valor los campos editables de dos versiones de la misma receta. */
export const calcularDiferencias = (
  antes: RecetaCompleta,
  despues: RecetaCompleta,
): DiferenciaReceta => {
  const diferencias: Partial<Record<CampoEditable, CambioCampo>> = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (!iguales(antes, despues, campo)) {
      diferencias[campo] = { antes: valorDe(antes, campo), despues: valorDe(despues, campo) };
    }
  }
  return diferencias;
};
