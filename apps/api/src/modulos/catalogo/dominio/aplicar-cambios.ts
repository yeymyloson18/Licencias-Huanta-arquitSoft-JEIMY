import type { CambioRequisito, CambiosReceta } from './cambios-receta';
import { verificarCoherencia } from './coherencia-ruta';
import { calcularDiferencias, type DiferenciaReceta } from './diferencia-receta';
import { type ErrorCampoReceta, ErrorValidacionReceta } from './error-validacion-receta';
import { PlazoDiasHabiles } from './plazo-dias-habiles';
import {
  CALIFICACIONES,
  ORDENES_ITSE,
  pertenece,
  type OrdenItse,
  type RecetaCompleta,
} from './receta-completa';
import {
  CONDICIONES_REQUISITO,
  crearRequisito,
  esCondicionRequisito,
  LONGITUD_MAXIMA_DESCRIPCION,
  type Requisito,
} from './requisito';
import { Tasa } from './tasa';

// Edición de una receta por el administrador (historia 3 de la 003). Está separada de
// receta-completa.ts para que la coherencia y las diferencias puedan usar sus tipos sin ciclos.

/** Lo que admite `numeric(10,2)` (research §R-03 de la 003). */
export const TASA_MAXIMA_CENTIMOS = 9_999_999_999;
export const REQUISITOS_MINIMOS = 1;
export const REQUISITOS_MAXIMOS = 30;

export interface ResultadoCambios {
  readonly receta: RecetaCompleta;
  readonly diferencias: DiferenciaReceta;
}

const MENSAJE_ENTERO = 'Debe ser un entero mayor o igual a 1';

const esEnteroPositivo = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 1;

/** Acumula los errores por campo para informarlos todos juntos. */
class Errores {
  readonly lista: ErrorCampoReceta[] = [];

  agregar(campo: string, mensaje: string): void {
    this.lista.push({ campo, mensaje });
  }

  tiene(campo: string): boolean {
    return this.lista.some((error) => error.campo === campo);
  }
}

const leerTasa = (texto: string, errores: Errores): Tasa | null => {
  let tasa: Tasa;
  try {
    tasa = Tasa.desdeTexto(texto);
  } catch {
    errores.agregar('tasa', 'Debe ser un monto en soles con 2 decimales como máximo, como 159.50');
    return null;
  }
  if (tasa.centimos > TASA_MAXIMA_CENTIMOS) {
    errores.agregar('tasa', 'No puede superar 99999999.99');
    return null;
  }
  return tasa;
};

const leerEnteroOpcional = (
  valor: number | null,
  campo: string,
  errores: Errores,
): number | null => {
  if (valor !== null && !esEnteroPositivo(valor)) {
    errores.agregar(campo, MENSAJE_ENTERO);
  }
  return valor;
};

const leerEnumeracion = <T extends string>(
  lista: readonly T[],
  valor: string,
  campo: string,
  errores: Errores,
): T | null => {
  if (!pertenece(lista, valor)) {
    errores.agregar(campo, `Debe ser ${lista.join(', ')}`);
    return null;
  }
  return valor;
};

/** Valida la lista nueva de requisitos; el orden final es la posición (FR-020). */
const leerRequisitos = (
  receta: RecetaCompleta,
  lista: readonly CambioRequisito[],
  errores: Errores,
): Requisito[] => {
  if (lista.length < REQUISITOS_MINIMOS || lista.length > REQUISITOS_MAXIMOS) {
    errores.agregar(
      'requisitos',
      `Debe tener entre ${String(REQUISITOS_MINIMOS)} y ${String(REQUISITOS_MAXIMOS)} requisitos`,
    );
  }

  const idsPropios = new Set(receta.requisitos.map((requisito) => requisito.id));
  const idsVistos = new Set<number>();
  const requisitos: Requisito[] = [];

  lista.forEach((cambio, indice) => {
    const prefijo = `requisitos[${String(indice)}]`;
    const descripcion = cambio.descripcion.trim();
    let valido = true;

    if (cambio.id !== undefined) {
      if (!idsPropios.has(cambio.id)) {
        errores.agregar(`${prefijo}.id`, 'No es un requisito de esta receta');
        valido = false;
      } else if (idsVistos.has(cambio.id)) {
        errores.agregar(`${prefijo}.id`, 'Está repetido en la lista');
        valido = false;
      } else {
        idsVistos.add(cambio.id);
      }
    }
    if (descripcion.length === 0) {
      errores.agregar(`${prefijo}.descripcion`, 'No puede estar vacía');
      valido = false;
    } else if (descripcion.length > LONGITUD_MAXIMA_DESCRIPCION) {
      errores.agregar(
        `${prefijo}.descripcion`,
        `No puede superar ${String(LONGITUD_MAXIMA_DESCRIPCION)} caracteres`,
      );
      valido = false;
    }
    if (!esCondicionRequisito(cambio.condicion)) {
      errores.agregar(`${prefijo}.condicion`, `Debe ser ${CONDICIONES_REQUISITO.join(', ')}`);
      valido = false;
    }

    if (valido) {
      requisitos.push(
        crearRequisito({
          id: cambio.id ?? null,
          orden: indice + 1,
          descripcion,
          obligatorio: cambio.obligatorio ?? true,
          condicion: cambio.condicion,
        }),
      );
    }
  });

  return requisitos;
};

const leerOrdenItse = (
  receta: RecetaCompleta,
  valor: string | null | undefined,
  errores: Errores,
): OrdenItse | null => {
  if (valor === undefined) {
    return receta.ordenItse;
  }
  return valor === null ? null : leerEnumeracion(ORDENES_ITSE, valor, 'ordenItse', errores);
};

/**
 * Aplica los cambios del administrador a la receta (FR-017 a FR-020, research §R-03 de la 003).
 * Función pura: devuelve la receta nueva y sus diferencias (vacías si no cambió nada), o lanza
 * `ErrorValidacionReceta` con **todos** los errores a la vez. Si la lista de requisitos queda igual
 * en contenido, se conservan los requisitos guardados (y sus `id`).
 */
export const aplicarCambios = (
  receta: RecetaCompleta,
  cambios: CambiosReceta,
): ResultadoCambios => {
  const errores = new Errores();

  const tasa = cambios.tasa === undefined ? receta.tasa : leerTasa(cambios.tasa, errores);

  let plazoDias = receta.plazoDias;
  if (cambios.plazoDias !== undefined) {
    if (esEnteroPositivo(cambios.plazoDias)) {
      plazoDias = PlazoDiasHabiles.crear(cambios.plazoDias);
    } else {
      errores.agregar('plazoDias', MENSAJE_ENTERO);
    }
  }

  const calificacion =
    cambios.calificacion === undefined
      ? receta.calificacion
      : leerEnumeracion(CALIFICACIONES, cambios.calificacion, 'calificacion', errores);
  const ordenItse = leerOrdenItse(receta, cambios.ordenItse, errores);
  const plazoItseDias =
    cambios.plazoItseDias === undefined
      ? receta.plazoItseDias
      : leerEnteroOpcional(cambios.plazoItseDias, 'plazoItseDias', errores);
  const vigenciaMeses =
    cambios.vigenciaMeses === undefined
      ? receta.vigenciaMeses
      : leerEnteroOpcional(cambios.vigenciaMeses, 'vigenciaMeses', errores);
  const requisitos =
    cambios.requisitos === undefined
      ? receta.requisitos
      : leerRequisitos(receta, cambios.requisitos, errores);

  // La coherencia con la ruta se revisa sobre el resultado; un campo que ya tiene error no se repite.
  if (calificacion !== null) {
    const coherencia = verificarCoherencia({
      tipo: receta.tipo,
      ruta: receta.ruta,
      calificacion,
      ordenItse,
      plazoItseDias,
      vigenciaMeses,
    });
    for (const error of coherencia) {
      if (!errores.tiene(error.campo)) {
        errores.agregar(error.campo, error.mensaje);
      }
    }
  }

  if (errores.lista.length > 0 || tasa === null || calificacion === null) {
    throw new ErrorValidacionReceta(errores.lista);
  }

  const candidata: RecetaCompleta = Object.freeze({
    ...receta,
    tasa,
    plazoDias,
    calificacion,
    ordenItse,
    plazoItseDias,
    vigenciaMeses,
    activa: cambios.activa ?? receta.activa,
    requisitos: Object.freeze([...requisitos]),
  });
  const diferencias = calcularDiferencias(receta, candidata);

  return {
    receta:
      diferencias.requisitos === undefined
        ? Object.freeze({ ...candidata, requisitos: receta.requisitos })
        : candidata,
    diferencias,
  };
};
