// Modo de color (013, US6; FR-019 y FR-020, corregidos el 2026-11-25). Solo hay dos modos, "claro" y
// "oscuro". Mientras la persona no elige, vale el del dispositivo (prefers-color-scheme) y no se pone
// atributo: el CSS lo resuelve desde el primer pintado. En cuanto elige, la elección se guarda en
// localStorage y se aplica con data-coreui-theme en <html>, y manda sobre el dispositivo. Si el
// navegador no deja guardar (modo privado, bloqueo), todo sigue funcionando.

export type ModoColor = 'claro' | 'oscuro';

export const CLAVE_MODO = 'licencias-modo-color';

const ATRIBUTO = 'data-coreui-theme';

export const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

const esModo = (valor: string | null): valor is ModoColor =>
  valor === 'claro' || valor === 'oscuro';

/** La elección guardada, o `null` si no hay (también con un valor ajeno o ilegible). */
export const leerModoGuardado = (): ModoColor | null => {
  try {
    const valor = localStorage.getItem(CLAVE_MODO);
    return esModo(valor) ? valor : null;
  } catch {
    return null;
  }
};

/** El modo del dispositivo (prefers-color-scheme). */
export const modoDelDispositivo = (): ModoColor =>
  typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_OSCURO).matches
    ? 'oscuro'
    : 'claro';

/** La elección guardada o, sin elección, el modo del dispositivo. */
export const modoInicial = (): ModoColor => leerModoGuardado() ?? modoDelDispositivo();

/** Guarda la elección. Si no se puede guardar, solo dura hasta recargar. */
export const guardarModo = (modo: ModoColor): void => {
  try {
    localStorage.setItem(CLAVE_MODO, modo);
  } catch {
    // Sin almacenamiento: la elección vale hasta recargar.
  }
};

/** Pone `light` o `dark` en <html>. */
export const aplicarModo = (modo: ModoColor): void => {
  document.documentElement.setAttribute(ATRIBUTO, modo === 'oscuro' ? 'dark' : 'light');
};

/** Quita el atributo: el CSS vuelve a seguir al dispositivo. */
export const quitarModo = (): void => {
  document.documentElement.removeAttribute(ATRIBUTO);
};

/** Aplica la elección guardada (main.tsx, antes de montar React). Sin elección, no pone atributo. */
export const aplicarModoGuardado = (): void => {
  const guardado = leerModoGuardado();
  if (guardado !== null) {
    aplicarModo(guardado);
  }
};
