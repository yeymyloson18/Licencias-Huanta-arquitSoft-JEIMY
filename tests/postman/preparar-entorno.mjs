// Prepara el entorno de Newman EN EL EJECUTOR del CI (008, research §R-05). Nunca en el repositorio:
//   node tests/postman/preparar-entorno.mjs <salida.json>
// 1. Siembra los usuarios de demostración con claves nuevas (sembrar-demostracion --salida).
// 2. Ingresa con CAJA y JEFATURA: clave + código simulado leído de Redis (dev:otp:<usuarioId>).
// 3. Escribe un entorno de Postman con los tokens en <salida.json> (fuera del repositorio).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');
const SALIDA = process.argv[2];
const BASE = process.env.BASE_URL ?? 'http://localhost:8080/api/v1';
if (!SALIDA) {
  console.error('Uso: node tests/postman/preparar-entorno.mjs <salida.json>');
  process.exit(64);
}

const compose = (...argumentos) =>
  execFileSync(
    'docker',
    ['compose', '-f', join(RAIZ, 'infra', 'docker-compose.yml'), ...argumentos],
    {
      encoding: 'utf8',
    },
  ).trim();

const { usuarios } = JSON.parse(
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

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

const leerOtp = async (usuarioId) => {
  for (let intento = 0; intento < 20; intento += 1) {
    const codigo = compose('exec', '-T', 'redis', 'redis-cli', 'GET', `dev:otp:${usuarioId}`);
    if (/^\d{6}$/.test(codigo)) return codigo;
    await pausa(500);
  }
  throw new Error('No llegó el código simulado');
};

const pedir = async (ruta, cuerpo) => {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) throw new Error(`${ruta} respondió ${respuesta.status}`);
  return respuesta.json();
};

const tokenDe = async (rol) => {
  const usuario = usuarios.find((u) => u.rol === rol);
  if (!usuario?.clave) throw new Error(`No hay usuario de demostración con clave para ${rol}`);
  const desafio = await pedir('/auth/iniciar-sesion', {
    correo: usuario.correo,
    clave: usuario.clave,
  });
  const codigo = await leerOtp(usuario.id);
  const sesion = await pedir('/auth/verificar-otp', { desafioId: desafio.desafioId, codigo });
  return sesion.accessToken ?? sesion.token;
};

const entorno = JSON.parse(
  readFileSync(join(import.meta.dirname, 'desarrollo.postman_environment.json'), 'utf8'),
);
const valores = {
  baseUrl: BASE,
  tokenCaja: await tokenDe('CAJA'),
  tokenJefatura: await tokenDe('JEFATURA'),
};
for (const variable of entorno.values) {
  if (variable.key in valores) variable.value = valores[variable.key];
}
writeFileSync(SALIDA, JSON.stringify(entorno));
console.log('Entorno de Newman listo (tokens solo en el ejecutor).');
