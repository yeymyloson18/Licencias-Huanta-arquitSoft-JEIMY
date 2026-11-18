/** Regla de la política de clave que una clave no cumple. */
export type ReglaClaveIncumplida =
  'LONGITUD_MINIMA' | 'LONGITUD_MAXIMA' | 'SIN_LETRA' | 'SIN_NUMERO' | 'IGUAL_A_LA_ACTUAL';

const MINIMO = 12;
const MAXIMO = 128;
const LETRA = /\p{L}/u;
const NUMERO = /[0-9]/;

const DESCRIPCIONES: Readonly<Record<ReglaClaveIncumplida, string>> = {
  LONGITUD_MINIMA: `Debe tener al menos ${String(MINIMO)} caracteres`,
  LONGITUD_MAXIMA: `Debe tener como máximo ${String(MAXIMO)} caracteres`,
  SIN_LETRA: 'Debe incluir al menos una letra',
  SIN_NUMERO: 'Debe incluir al menos un número',
  IGUAL_A_LA_ACTUAL: 'No puede ser igual a la clave actual',
};

/** Política de clave (FR-022a): 12 a 128 caracteres, con al menos una letra y un número. */
export const PoliticaClave = {
  validar(texto: string): ReglaClaveIncumplida[] {
    const incumplidas: ReglaClaveIncumplida[] = [];
    const longitud = Array.from(texto).length;
    if (longitud < MINIMO) {
      incumplidas.push('LONGITUD_MINIMA');
    }
    if (longitud > MAXIMO) {
      incumplidas.push('LONGITUD_MAXIMA');
    }
    if (!LETRA.test(texto)) {
      incumplidas.push('SIN_LETRA');
    }
    if (!NUMERO.test(texto)) {
      incumplidas.push('SIN_NUMERO');
    }
    return incumplidas;
  },

  /** Texto para mostrar al usuario; nunca incluye la clave. */
  describir(regla: ReglaClaveIncumplida): string {
    return DESCRIPCIONES[regla];
  },
};
