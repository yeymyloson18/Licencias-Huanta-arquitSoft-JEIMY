import { useCallback, useEffect, useState } from 'react';
import {
  aplicarModo,
  CLAVE_MODO,
  guardarModo,
  leerModoGuardado,
  type ModoColor,
} from './modo-color';

/**
 * Modo de color elegido (013, US6). Elegir lo aplica y lo guarda; un cambio hecho en otra pestaña
 * (evento `storage`) se aplica aquí. En "sistema" no hace nada con matchMedia: el CSS sigue al
 * sistema. No se usa `useColorModes` de CoreUI porque no protege localStorage y siempre escribe el
 * atributo (research R-05).
 */
export function useModoColor() {
  const [modo, setModo] = useState<ModoColor>(leerModoGuardado);

  useEffect(() => {
    const alCambiarOtraPestana = (evento: StorageEvent) => {
      if (evento.key !== null && evento.key !== CLAVE_MODO) {
        return;
      }
      const guardado = leerModoGuardado();
      aplicarModo(guardado);
      setModo(guardado);
    };
    window.addEventListener('storage', alCambiarOtraPestana);
    return () => {
      window.removeEventListener('storage', alCambiarOtraPestana);
    };
  }, []);

  const elegir = useCallback((nuevo: ModoColor) => {
    guardarModo(nuevo);
    aplicarModo(nuevo);
    setModo(nuevo);
  }, []);

  return { modo, elegir };
}
