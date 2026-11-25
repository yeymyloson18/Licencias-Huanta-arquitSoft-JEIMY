import { useCallback, useEffect, useState } from 'react';
import {
  aplicarModo,
  CLAVE_MODO,
  CONSULTA_OSCURO,
  guardarModo,
  leerModoGuardado,
  type ModoColor,
  modoDelDispositivo,
  modoInicial,
  quitarModo,
} from './modo-color';

/**
 * Modo de color (013, US6; FR-019 y FR-020 corregidos): dos estados. Sin elección, sigue al
 * dispositivo (y se actualiza si cambia); `alternar` pasa al otro modo, lo guarda y lo aplica, y desde
 * ahí la elección manda. Un cambio hecho en otra pestaña (evento `storage`) se aplica aquí. No se usa
 * `useColorModes` de CoreUI porque no protege localStorage (research R-05).
 */
export function useModoColor() {
  const [modo, setModo] = useState<ModoColor>(modoInicial);
  // Si la persona eligió en esta página. Sin almacenamiento, la elección no queda en localStorage,
  // pero igual debe mandar sobre el dispositivo hasta recargar.
  const [eligio, setEligio] = useState(() => leerModoGuardado() !== null);

  useEffect(() => {
    if (eligio || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const medio = window.matchMedia(CONSULTA_OSCURO);
    const alCambiarDispositivo = () => {
      setModo(modoDelDispositivo());
    };
    medio.addEventListener('change', alCambiarDispositivo);
    return () => {
      medio.removeEventListener('change', alCambiarDispositivo);
    };
  }, [eligio]);

  useEffect(() => {
    const alCambiarOtraPestana = (evento: StorageEvent) => {
      if (evento.key !== null && evento.key !== CLAVE_MODO) {
        return;
      }
      const guardado = leerModoGuardado();
      if (guardado === null) {
        quitarModo();
        setEligio(false);
        setModo(modoDelDispositivo());
        return;
      }
      aplicarModo(guardado);
      setEligio(true);
      setModo(guardado);
    };
    window.addEventListener('storage', alCambiarOtraPestana);
    return () => {
      window.removeEventListener('storage', alCambiarOtraPestana);
    };
  }, []);

  const alternar = useCallback(() => {
    setModo((actual) => {
      const nuevo: ModoColor = actual === 'oscuro' ? 'claro' : 'oscuro';
      guardarModo(nuevo);
      aplicarModo(nuevo);
      return nuevo;
    });
    setEligio(true);
  }, []);

  return { modo, alternar };
}
