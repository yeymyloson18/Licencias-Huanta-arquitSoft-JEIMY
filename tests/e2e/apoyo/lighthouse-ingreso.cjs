// puppeteerScript de Lighthouse CI (011, T035; FR-018 y EQ-05): ingresa una vez como el usuario de
// demostración de CAJA para medir pantallas con sesión (/perfil y /cambiar-clave). Lee la clave de
// tests/e2e/.datos/usuarios-demo.json, que deja el E2E (con la clave nueva si Mi perfil la cambió), y
// el código simulado de Redis con `docker compose exec`, igual que apoyo/sistema.ts. Solo contra el
// compose de E2E con ENVIO_OTP=simulado; nunca contra producción. Datos FICTICIOS.
'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const RAIZ = join(__dirname, '..', '..', '..');
const ARCHIVO_USUARIOS = join(__dirname, '..', '.datos', 'usuarios-demo.json');

const compose = (...argumentos) =>
  execFileSync(
    'docker',
    ['compose', '-f', join(RAIZ, 'infra', 'docker-compose.yml'), ...argumentos],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();

const leerOtp = async (id) => {
  for (let intento = 0; intento < 20; intento += 1) {
    const codigo = compose('exec', '-T', 'redis', 'redis-cli', 'GET', `dev:otp:${id}`);
    if (/^\d{6}$/.test(codigo)) {
      return codigo;
    }
    await new Promise((resolver) => setTimeout(resolver, 500));
  }
  throw new Error('No llegó el código simulado');
};

let conSesion = false;

/** Lighthouse CI lo llama antes de cada URL; con `disableStorageReset` basta ingresar una vez. */
module.exports = async (browser, context) => {
  if (conSesion) {
    return;
  }
  const usuarios = JSON.parse(readFileSync(ARCHIVO_USUARIOS, 'utf8'));
  const caja = usuarios.find((u) => u.rol === 'CAJA');
  if (!caja || !caja.clave) {
    throw new Error('No hay usuario de demostración con clave para CAJA');
  }
  // Mismos contadores que aísla el E2E entre recorridos (apoyo/sistema.ts).
  compose(
    'exec',
    '-T',
    'redis',
    'redis-cli',
    'EVAL',
    "for _, k in ipairs(redis.call('KEYS', ARGV[1])) do redis.call('DEL', k) end return 1",
    '0',
    'lim:envios:usuario:*',
  );

  const pagina = await browser.newPage();
  await pagina.goto(new URL('/ingresar', context.url).href, { waitUntil: 'networkidle0' });
  await pagina.type('input[autocomplete="username"]', caja.correo);
  await pagina.type('input[autocomplete="current-password"]', caja.clave);
  await pagina.click('form button[type="submit"]');
  await pagina.waitForSelector('input[autocomplete="one-time-code"]');
  await pagina.type('input[autocomplete="one-time-code"]', await leerOtp(caja.id));
  await pagina.click('form button[type="submit"]');
  await pagina.waitForSelector('nav[aria-label="Menú del personal"]');
  await pagina.close();
  conSesion = true;
};
