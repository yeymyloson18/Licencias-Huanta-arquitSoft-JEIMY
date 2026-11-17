import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// Configuración validada al arrancar (research.md §R-15). Los errores nombran las variables
// inválidas, nunca sus valores, para no exponer credenciales en los logs (principio VII).

export const CONFIGURACION = Symbol('CONFIGURACION');

const leerVersionPaquete = (): string => {
  try {
    // Igual profundidad desde src/ y dist/: <raiz-api>/{src|dist}/compartido/infraestructura.
    const ruta = join(__dirname, '..', '..', '..', 'package.json');
    const paquete = JSON.parse(readFileSync(ruta, 'utf8')) as { version?: unknown };
    return typeof paquete.version === 'string' ? paquete.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
};

const enteroPositivo = (porDefecto: number) =>
  z.coerce.number().int().positive().default(porDefecto);

const esquemaConfiguracion = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  PUERTO_API: enteroPositivo(3000),
  CATALOGO_CACHE_TTL_SEGUNDOS: enteroPositivo(300),
  SALUD_TIMEOUT_MS: enteroPositivo(2000),
  VERSION_SERVICIO: z.string().min(1).optional(),
});

export interface Configuracion {
  readonly urlBaseDeDatos: string;
  readonly urlRedis: string;
  readonly puertoApi: number;
  readonly catalogoCacheTtlSegundos: number;
  readonly saludTimeoutMs: number;
  readonly versionServicio: string;
}

export class ErrorConfiguracion extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Configuración inválida. Revise las variables: ${variables.join(', ')}`);
    this.name = 'ErrorConfiguracion';
  }
}

export const cargarConfiguracion = (
  env: Readonly<Record<string, string | undefined>>,
): Configuracion => {
  // Las variables vacías se tratan como ausentes para que apliquen los valores por defecto.
  const entrada = Object.fromEntries(Object.entries(env).filter(([, valor]) => valor !== ''));
  const resultado = esquemaConfiguracion.safeParse(entrada);

  if (!resultado.success) {
    const variables = [
      ...new Set(resultado.error.issues.map((problema) => String(problema.path[0]))),
    ];
    throw new ErrorConfiguracion(variables);
  }

  const datos = resultado.data;
  return {
    urlBaseDeDatos: datos.DATABASE_URL,
    urlRedis: datos.REDIS_URL,
    puertoApi: datos.PUERTO_API,
    catalogoCacheTtlSegundos: datos.CATALOGO_CACHE_TTL_SEGUNDOS,
    saludTimeoutMs: datos.SALUD_TIMEOUT_MS,
    versionServicio: datos.VERSION_SERVICIO ?? leerVersionPaquete(),
  };
};
