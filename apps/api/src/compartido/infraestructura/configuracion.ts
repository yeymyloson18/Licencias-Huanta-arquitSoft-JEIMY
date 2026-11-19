import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// Configuración validada al arrancar (research.md §R-15 de la 001 y §R-16 de la 002). Los errores
// nombran las variables inválidas, nunca sus valores, para no exponer credenciales en los logs
// (principio VII).

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

// FR-024 de la 003: un cambio del catálogo debe verse en 5 minutos como máximo aunque falle la
// invalidación. El navegador guarda las respuestas públicas 60 s (Cache-Control), así que Redis
// puede guardarlas como mucho 240 s (research.md §R-06 de la 003).
export const CATALOGO_CACHE_TTL_MAXIMO_SEGUNDOS = 240;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Texto base64 que decodifica a `minimo`..`maximo` bytes. */
const claveBase64 = (minimo: number, maximo = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .regex(BASE64)
    .refine((texto) => {
      const bytes = Buffer.from(texto, 'base64').length;
      return bytes >= minimo && bytes <= maximo;
    });

const esquemaConfiguracion = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  PUERTO_API: enteroPositivo(3000),
  CATALOGO_CACHE_TTL_SEGUNDOS: enteroPositivo(CATALOGO_CACHE_TTL_MAXIMO_SEGUNDOS),
  SALUD_TIMEOUT_MS: enteroPositivo(2000),
  VERSION_SERVICIO: z.string().min(1).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRETO: z.string().refine((texto) => Buffer.byteLength(texto) >= 32),
  CLAVE_CIFRADO_DATOS: claveBase64(32, 32),
  CLAVE_HMAC_DATOS: claveBase64(32),
  ENVIO_OTP: z.enum(['simulado', 'sms']).default('simulado'),
  TRUST_PROXY_SALTOS: z.coerce.number().int().min(0).default(1),
});

// Valores ficticios de .env.example: prohibidos en producción (research.md §R-16 de la 002).
const VALORES_DE_EJEMPLO: Readonly<Record<string, string>> = {
  JWT_SECRETO: 'desarrollo-jwt-solo-no-usar-en-produccion',
  CLAVE_CIFRADO_DATOS: 'ZGVzYXJyb2xsby1jaWZyYWRvLW5vLXVzYXItcHJvZCE=',
  CLAVE_HMAC_DATOS: 'ZGVzYXJyb2xsby1obWFjLXNvbG8tbm8tdXNhci1lbi1wcm9kdWNjaW9u',
};

export type Entorno = 'development' | 'test' | 'production';
export type ModoEnvioOtp = 'simulado' | 'sms';

export interface Configuracion {
  readonly urlBaseDeDatos: string;
  readonly urlRedis: string;
  readonly puertoApi: number;
  readonly catalogoCacheTtlSegundos: number;
  readonly saludTimeoutMs: number;
  readonly versionServicio: string;
  readonly entorno: Entorno;
  readonly jwtSecreto: string;
  readonly claveCifradoDatos: Buffer;
  readonly claveHmacDatos: Buffer;
  readonly envioOtp: ModoEnvioOtp;
  readonly trustProxySaltos: number;
}

export class ErrorConfiguracion extends Error {
  constructor(
    readonly variables: readonly string[],
    readonly avisos: readonly string[] = [],
  ) {
    super(
      [`Configuración inválida. Revise las variables: ${variables.join(', ')}`, ...avisos].join(
        '. ',
      ),
    );
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
  const variables: string[] = [];
  const avisos: string[] = [];

  if (datos.CATALOGO_CACHE_TTL_SEGUNDOS > CATALOGO_CACHE_TTL_MAXIMO_SEGUNDOS) {
    variables.push('CATALOGO_CACHE_TTL_SEGUNDOS');
    avisos.push(
      `CATALOGO_CACHE_TTL_SEGUNDOS no puede superar ${String(CATALOGO_CACHE_TTL_MAXIMO_SEGUNDOS)}: ` +
        'TTL de Redis + 60 s del navegador no puede superar 5 minutos',
    );
  }

  if (datos.ENVIO_OTP === 'sms') {
    variables.push('ENVIO_OTP');
    avisos.push('No hay proveedor de SMS configurado');
  }

  if (datos.NODE_ENV === 'production') {
    if (datos.ENVIO_OTP === 'simulado') {
      variables.push('ENVIO_OTP');
      avisos.push('El envío simulado del código no se permite en producción');
    }
    for (const [variable, valorEjemplo] of Object.entries(VALORES_DE_EJEMPLO)) {
      if (datos[variable as keyof typeof datos] === valorEjemplo) {
        variables.push(variable);
        avisos.push(`${variable} tiene el valor de ejemplo de .env.example`);
      }
    }
  }

  if (variables.length > 0) {
    throw new ErrorConfiguracion([...new Set(variables)], avisos);
  }

  return {
    urlBaseDeDatos: datos.DATABASE_URL,
    urlRedis: datos.REDIS_URL,
    puertoApi: datos.PUERTO_API,
    catalogoCacheTtlSegundos: datos.CATALOGO_CACHE_TTL_SEGUNDOS,
    saludTimeoutMs: datos.SALUD_TIMEOUT_MS,
    versionServicio: datos.VERSION_SERVICIO ?? leerVersionPaquete(),
    entorno: datos.NODE_ENV,
    jwtSecreto: datos.JWT_SECRETO,
    claveCifradoDatos: Buffer.from(datos.CLAVE_CIFRADO_DATOS, 'base64'),
    claveHmacDatos: Buffer.from(datos.CLAVE_HMAC_DATOS, 'base64'),
    envioOtp: datos.ENVIO_OTP,
    trustProxySaltos: datos.TRUST_PROXY_SALTOS,
  };
};
