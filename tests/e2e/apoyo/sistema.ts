import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

// Apoyo de las pruebas E2E (research §R-11 de la 007). Habla con el sistema levantado con
// `docker compose -f infra/docker-compose.yml` (o con otro proyecto si se define E2E_PROYECTO), igual
// que una persona que mira el SMS simulado: lee el código de Redis. El servicio no tiene ningún
// endpoint para leer códigos. Datos FICTICIOS.

export type Rol = 'MESA_PARTES' | 'EVALUADOR' | 'INSPECTOR' | 'CAJA' | 'JEFATURA' | 'ADMINISTRADOR';

export interface UsuarioDemo {
  readonly rol: Rol;
  readonly id: string;
  readonly correo: string;
  readonly clave: string | null;
}

/** Dirección del portal de pruebas (el compose de desarrollo publica el portal en el 8080). */
export const URL_BASE = process.env.E2E_URL ?? 'http://localhost:8080';

const RAIZ = join(__dirname, '..', '..', '..');
const CARPETA_DATOS = join(__dirname, '..', '.datos');
const ARCHIVO_USUARIOS = join(CARPETA_DATOS, 'usuarios-demo.json');

/** Argumentos de `docker compose` para el proyecto de pruebas. */
const compose = (...argumentos: string[]): string[] => [
  'compose',
  '-f',
  join(RAIZ, 'infra', 'docker-compose.yml'),
  ...(process.env.E2E_PROYECTO ? ['-p', process.env.E2E_PROYECTO] : []),
  ...argumentos,
];

const docker = (argumentos: string[]): string =>
  execFileSync('docker', argumentos, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** Siembra los usuarios de demostración con claves nuevas y los guarda para las pruebas. */
export const sembrarUsuarios = (): void => {
  const salida = docker(
    compose(
      'exec',
      '-T',
      'api',
      'node',
      'dist/scripts/sembrar-demostracion.js',
      '--regenerar',
      '--salida',
      '-',
    ),
  );
  const { usuarios } = JSON.parse(salida) as { usuarios: UsuarioDemo[] };
  mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO_USUARIOS, JSON.stringify(usuarios));
};

export const usuario = (rol: Rol): UsuarioDemo & { readonly clave: string } => {
  const usuarios = JSON.parse(readFileSync(ARCHIVO_USUARIOS, 'utf8')) as UsuarioDemo[];
  const encontrado = usuarios.find((u) => u.rol === rol);
  if (encontrado?.clave == null) {
    throw new Error(`No hay usuario de demostración con clave para ${rol}`);
  }
  return { ...encontrado, clave: encontrado.clave };
};

/**
 * Guarda la clave nueva de un usuario de demostración después de cambiarla (011, Mi perfil), para que
 * los recorridos siguientes y el otro tamaño de pantalla ingresen con ella.
 */
export const guardarClave = (rol: Rol, clave: string): void => {
  const usuarios = JSON.parse(readFileSync(ARCHIVO_USUARIOS, 'utf8')) as UsuarioDemo[];
  writeFileSync(
    ARCHIVO_USUARIOS,
    JSON.stringify(usuarios.map((u) => (u.rol === rol ? { ...u, clave } : u))),
  );
};

/** Código simulado (`dev:otp:<id>`), con reintentos mientras llega. */
export const leerOtp = async (clave: string): Promise<string> => {
  for (let intento = 0; intento < 20; intento += 1) {
    const codigo = docker(compose('exec', '-T', 'redis', 'redis-cli', 'GET', `dev:otp:${clave}`));
    if (/^\d{6}$/.test(codigo)) {
      return codigo;
    }
    await new Promise((resolver) => setTimeout(resolver, 500));
  }
  throw new Error('No llegó el código simulado');
};

/** Código de verificación del QR de la licencia de un expediente (lo que lleva el PDF). */
export const codigoVerificacion = (numeroExpediente: string): string => {
  if (!/^EXP-\d{4}-\d{6}$/.test(numeroExpediente)) {
    throw new Error('Número de expediente inválido');
  }
  return docker(
    compose(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'licencias',
      '-d',
      'licencias',
      '-tAc',
      `SELECT codigo_verificacion FROM licencias.licencia WHERE numero_expediente = '${numeroExpediente}'`,
    ),
  );
};

/**
 * Solo en el compose de pruebas de E2E: borra los contadores de envíos de código y de verificación de
 * identidad (002 y 004). Cada recorrido entra con los mismos usuarios de demostración y el mismo
 * titular ficticio, y con dos tamaños de pantalla y reintentos se superan los 3 códigos cada 15
 * minutos. Los límites siguen activos y probados en las pruebas de integración; aquí solo se aísla
 * un recorrido del anterior. Nunca se usa contra producción (URL_BASE apunta al compose local).
 */
export const aislarLimitesDePrueba = (): void => {
  docker(
    compose(
      'exec',
      '-T',
      'redis',
      'redis-cli',
      'EVAL',
      "for _, patron in ipairs(ARGV) do for _, k in ipairs(redis.call('KEYS', patron)) do redis.call('DEL', k) end end return 1",
      '0',
      'lim:envios:usuario:*',
      'lim:identidad:*',
    ),
  );
};

/** Ingreso del personal con clave y código (002). */
export const ingresar = async (pagina: Page, rol: Rol): Promise<void> => {
  const persona = usuario(rol);
  aislarLimitesDePrueba();
  await pagina.goto('/ingresar');
  await pagina.getByLabel('Correo').fill(persona.correo);
  await pagina.getByLabel('Clave', { exact: true }).fill(persona.clave);
  await pagina.getByRole('button', { name: 'Continuar' }).click();
  await pagina.getByLabel('Código').fill(await leerOtp(persona.id));
  await pagina.getByRole('button', { name: 'Ingresar' }).click();
  // 013 (R-11): se espera el botón con el nombre del usuario en la barra, no el <nav> lateral, que a
  // 360 px está fuera de la pantalla hasta abrirlo con "Mostrar menú".
  await expect(pagina.locator('.desplegable-usuario').getByRole('button')).toBeVisible();
};

export const hoyLima = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

/** Archivos ficticios para adjuntar. */
export const ARCHIVOS = {
  pdf: {
    name: 'solicitud-ficticia.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% documento ficticio de prueba\n%%EOF\n'),
  },
  jpg: (nombre: string) => ({
    name: nombre,
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  }),
};
