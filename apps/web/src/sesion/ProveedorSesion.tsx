import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { cerrarSesion } from '../servicios/clienteApi';
import { obtenerUltimaActividad, seguirActividad } from './actividad';
import {
  fijarSesion,
  momentoEmision,
  obtenerSesion,
  type SesionPersonal,
  suscribirSesion,
} from './almacen-sesion';
import { renovarSesion } from './renovacion';

const MINUTO = 60_000;
const RENOVAR_DESPUES_DE = 13 * MINUTO;
const CERRAR_TRAS_INACTIVIDAD = 30 * MINUTO;
const REVISAR_CADA = 30_000;

export type EstadoSesion = 'cargando' | 'sin-sesion' | 'con-sesion';

export interface ContextoSesion {
  readonly estado: EstadoSesion;
  readonly sesion: SesionPersonal | null;
  /** Aviso para mostrar en la siguiente pantalla (por ejemplo, cierre por inactividad). */
  readonly aviso: string | null;
  readonly entrar: (sesion: SesionPersonal) => void;
  readonly salir: (aviso?: string) => Promise<void>;
  readonly limpiarAviso: () => void;
}

const Contexto = createContext<ContextoSesion | null>(null);

/**
 * Sesión del personal en el portal (contracts/portal-seguridad.md): recupera la sesión desde la
 * cookie al abrir, renueva el token a los 13 minutos si hubo actividad en los últimos 30 y cierra la
 * sesión tras 30 minutos sin actividad.
 */
export function ProveedorSesion({ children }: { readonly children: ReactNode }) {
  const sesion = useSyncExternalStore(suscribirSesion, obtenerSesion);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void renovarSesion().finally(() => {
      if (vigente) {
        setCargando(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => seguirActividad(), []);

  const salir = useCallback(async (mensaje?: string) => {
    try {
      await cerrarSesion();
    } finally {
      fijarSesion(null);
      setAviso(mensaje ?? null);
    }
  }, []);

  useEffect(() => {
    if (sesion === null) {
      return;
    }
    const intervalo = setInterval(() => {
      const ahora = Date.now();
      const inactivo = ahora - obtenerUltimaActividad();
      if (inactivo >= CERRAR_TRAS_INACTIVIDAD) {
        void salir('Su sesión se cerró por inactividad');
      } else if (ahora - momentoEmision() >= RENOVAR_DESPUES_DE) {
        void renovarSesion();
      }
    }, REVISAR_CADA);
    return () => {
      clearInterval(intervalo);
    };
  }, [sesion, salir]);

  const valor = useMemo<ContextoSesion>(
    () => ({
      estado: cargando ? 'cargando' : sesion === null ? 'sin-sesion' : 'con-sesion',
      sesion,
      aviso,
      entrar: (nueva) => {
        setAviso(null);
        fijarSesion(nueva);
      },
      salir,
      limpiarAviso: () => {
        setAviso(null);
      },
    }),
    [cargando, sesion, aviso, salir],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSesion = (): ContextoSesion => {
  const contexto = useContext(Contexto);
  if (contexto === null) {
    throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  }
  return contexto;
};
