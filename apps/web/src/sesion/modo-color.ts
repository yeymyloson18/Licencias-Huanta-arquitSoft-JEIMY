// Modo de color (013, US6; research R-05). La elección se guarda en localStorage; si el navegador no
// lo permite (modo privado, bloqueo), todo sigue funcionando con "sistema". Se aplica con el atributo
// data-coreui-theme en <html>. Sin elección no hay atributo y el CSS sigue al sistema.

export type ModoColor = 'claro' | 'oscuro' | 'sistema';

export const CLAVE_MODO = 'licencias-modo-color';

const ATRIBUTO = 'data-coreui-theme';

const esModo = (valor: string | null): valor is ModoColor =>
  valor === 'claro' || valor === 'oscuro' || valor === 'sistema';

/** El modo guardado; un valor ausente, ajeno o ilegible es "sistema". */
export const leerModoGuardado = (): ModoColor => {
  try {
    const valor = localStorage.getItem(CLAVE_MODO);
    return esModo(valor) ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
};

/** Guarda la elección; "sistema" la borra. Si no se puede guardar, solo dura en esta pestaña. */
export const guardarModo = (modo: ModoColor): void => {
  try {
    if (modo === 'sistema') {
      localStorage.removeItem(CLAVE_MODO);
    } else {
      localStorage.setItem(CLAVE_MODO, modo);
    }
  } catch {
    // Sin almacenamiento: la elección vale hasta recargar.
  }
};

/** Pone `light` o `dark` en <html>, o lo quita para seguir al sistema. */
export const aplicarModo = (modo: ModoColor): void => {
  const raiz = document.documentElement;
  if (modo === 'sistema') {
    raiz.removeAttribute(ATRIBUTO);
  } else {
    raiz.setAttribute(ATRIBUTO, modo === 'oscuro' ? 'dark' : 'light');
  }
};

/** Aplica la elección guardada (main.tsx, antes de montar React). */
export const aplicarModoGuardado = (): void => {
  aplicarModo(leerModoGuardado());
};
