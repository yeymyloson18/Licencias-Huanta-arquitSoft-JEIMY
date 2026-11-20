import type { CacheReportes } from '../dominio/puertos';

/** Los reportes se reutilizan 5 minutos (FR-014 de la 007). */
export const VIDA_CACHE_SEGUNDOS = 300;

/**
 * Lee de la caché o calcula y guarda. Si la caché falla al leer o al guardar, avisa (sin la clave,
 * que puede llevar filtros) y responde igual con el cálculo directo (research §R-04).
 */
export const conCache = async <T>(
  cache: CacheReportes,
  clave: string,
  calcular: () => Promise<T>,
  avisar: (mensaje: string) => void,
): Promise<T> => {
  try {
    const guardado = await cache.leer(clave);
    if (guardado !== null) {
      return JSON.parse(guardado) as T;
    }
  } catch {
    avisar('No se pudo leer la caché de reportes; se calcula directo');
  }
  const valor = await calcular();
  try {
    await cache.guardar(clave, JSON.stringify(valor), VIDA_CACHE_SEGUNDOS);
  } catch {
    avisar('No se pudo guardar la caché de reportes');
  }
  return valor;
};
