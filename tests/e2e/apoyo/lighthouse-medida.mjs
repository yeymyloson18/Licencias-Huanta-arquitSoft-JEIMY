// Línea base y medida "después" del diseño con CoreUI (013, SC-002, SC-003 y SC-004; tasks T002).
// Lighthouse 12 con flujos de puppeteer, en modo móvil 360×740, con la MEDIANA de N corridas por
// pantalla y modo. Se usa contra el compose AISLADO de medición, nunca contra el de desarrollo, y no
// usa al proveedor de IA (el chat solo se abre).
//
//   node lighthouse-medida.mjs --url http://localhost:8090 --proyecto licencias-medida
//     --compose <ruta a infra/docker-compose.yml> --usuarios <ruta a tests/e2e/.datos/usuarios-demo.json>
//     [--corridas 3] [--modos claro,oscuro] [--chrome <ruta>] --salida <archivo.md>
//
// Necesita `lighthouse` y `puppeteer-core` junto al script (como lighthouse-chat.mjs). Los usuarios
// los siembra la preparación global de Playwright: correr antes `CAPTURAS=... playwright test`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { startFlow } from 'lighthouse';
import puppeteer from 'puppeteer-core';

const argumento = (nombre, porDefecto) => {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 && process.argv[indice + 1] ? process.argv[indice + 1] : porDefecto;
};

const BASE = argumento('--url', 'http://localhost:8090').replace(/\/+$/, '');
const PROYECTO = argumento('--proyecto', 'licencias-medida');
const COMPOSE = argumento('--compose', 'infra/docker-compose.yml');
const USUARIOS = argumento('--usuarios', 'tests/e2e/.datos/usuarios-demo.json');
const CORRIDAS = Number(argumento('--corridas', '3'));
const MODOS = argumento('--modos', 'claro').split(',');
const CHROME = argumento('--chrome', process.env.CHROME_PATH ?? '/usr/bin/google-chrome');
const SALIDA = argumento('--salida', 'lighthouse-medida.md');

if (!existsSync(USUARIOS)) {
  console.error(
    `No están los usuarios de demostración (${USUARIOS}). Primero correr las capturas con ` +
      `E2E_PROYECTO=${PROYECTO}, cuya preparación global los siembra.`,
  );
  process.exit(1);
}
const usuarios = JSON.parse(readFileSync(USUARIOS, 'utf8'));
const usuario = (rol) => {
  const encontrado = usuarios.find((u) => u.rol === rol);
  if (!encontrado?.clave) {
    console.error(`No hay usuario de demostración con clave para ${rol}`);
    process.exit(1);
  }
  return encontrado;
};

const compose = (...argumentos) =>
  execFileSync('docker', ['compose', '-f', COMPOSE, '-p', PROYECTO, ...argumentos], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

// Mismos contadores que aísla el E2E entre recorridos (apoyo/sistema.ts).
const aislarLimites = () =>
  compose(
    'exec',
    '-T',
    'redis',
    'redis-cli',
    'EVAL',
    "for _, patron in ipairs(ARGV) do for _, k in ipairs(redis.call('KEYS', patron)) do redis.call('DEL', k) end end return 1",
    '0',
    'lim:envios:usuario:*',
    'lim:fallos:*',
  );

const leerOtp = async (id) => {
  for (let intento = 0; intento < 20; intento += 1) {
    const codigo = compose('exec', '-T', 'redis', 'redis-cli', 'GET', `dev:otp:${id}`);
    if (/^\d{6}$/.test(codigo)) {
      return codigo;
    }
    await new Promise((listo) => setTimeout(listo, 500));
  }
  throw new Error('No llegó el código simulado');
};

const configuracion = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['performance', 'accessibility'],
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      disabled: false,
    },
    // La sesión del personal vive en la cookie de renovación: no borrar el almacenamiento.
    disableStorageReset: true,
  },
};

const ingresar = async (pagina, rol) => {
  const persona = usuario(rol);
  aislarLimites();
  await pagina.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle0' });
  await pagina.type('input[autocomplete="username"]', persona.correo);
  await pagina.type('input[autocomplete="current-password"]', persona.clave);
  await pagina.click('form button[type="submit"]');
  await pagina.waitForSelector('input[autocomplete="one-time-code"]');
  await pagina.type('input[autocomplete="one-time-code"]', await leerOtp(persona.id));
  await pagina.click('form button[type="submit"]');
  await pagina.waitForSelector('nav[aria-label="Menú del personal"]');
};

/** Tamaño del CSS y del JS que descargó una navegación (bytes transferidos y sin comprimir). */
const pesos = (lhr) => {
  const items = lhr.audits['network-requests']?.details?.items ?? [];
  const suma = (tipo) =>
    items
      .filter((item) => item.resourceType === tipo)
      .reduce(
        (total, item) => ({
          transferido: total.transferido + (item.transferSize ?? 0),
          sinComprimir: total.sinComprimir + (item.resourceSize ?? 0),
        }),
        { transferido: 0, sinComprimir: 0 },
      );
  return { css: suma('Stylesheet'), js: suma('Script') };
};

const fallidas = (lhr) =>
  Object.values(lhr.audits)
    .filter(
      (auditoria) =>
        auditoria.score === 0 &&
        auditoria.scoreDisplayMode === 'binary' &&
        lhr.categories.accessibility.auditRefs.some((ref) => ref.id === auditoria.id),
    )
    .map((auditoria) => auditoria.id);

/** Una corrida: las pantallas públicas, el chat abierto y las del personal, en un modo. */
const corrida = async (modo) => {
  const navegador = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  });
  const resultados = [];
  try {
    const medirEn = async (nombrePagina, pasos) => {
      const contexto = await navegador.createBrowserContext();
      const pagina = await contexto.newPage();
      await pagina.setViewport({
        width: 360,
        height: 740,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      await pagina.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: modo === 'oscuro' ? 'dark' : 'light' },
      ]);
      const flujo = await startFlow(pagina, { name: nombrePagina, config: configuracion });
      // Caché fría en cada navegación medida (las cookies de la sesión se conservan): sin esto,
      // las pantallas medidas después de la portada saldrían con la caché caliente.
      const cdp = await pagina.createCDPSession();
      const navegarFrio = async (url, nombre) => {
        await cdp.send('Network.clearBrowserCache');
        await flujo.navigate(url, { name: nombre });
      };
      await pasos(navegarFrio, flujo, pagina);
      const flujoResultado = await flujo.createFlowResult();
      for (const paso of flujoResultado.steps) {
        resultados.push({
          pantalla: paso.name,
          modo,
          // En modo snapshot Lighthouse no mide rendimiento: no se anota.
          rendimiento:
            paso.lhr.gatherMode === 'navigation'
              ? (paso.lhr.categories.performance?.score ?? null)
              : null,
          accesibilidad: paso.lhr.categories.accessibility.score,
          fallidas: fallidas(paso.lhr),
          pesos: paso.lhr.gatherMode === 'navigation' ? pesos(paso.lhr) : null,
        });
      }
      await contexto.close();
    };

    await medirEn('públicas', async (navegarFrio, flujo, pagina) => {
      await navegarFrio(`${BASE}/`, 'Portada');
      await navegarFrio(`${BASE}/asistente`, 'Asistente');
      await navegarFrio(`${BASE}/consulta`, 'Consulta');
      await navegarFrio(`${BASE}/ingresar`, 'Ingresar');
      await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
      await pagina.click('button.boton-preguntanos');
      await pagina.waitForSelector('dialog.chat-orientacion[open]');
      await flujo.snapshot({ name: 'Chat abierto (snapshot)' });
    });
    await medirEn('bandeja', async (navegarFrio, _flujo, pagina) => {
      await ingresar(pagina, 'EVALUADOR');
      await navegarFrio(`${BASE}/personal/expedientes`, 'Bandeja (EVALUADOR)');
    });
    await medirEn('tablero', async (navegarFrio, _flujo, pagina) => {
      await ingresar(pagina, 'JEFATURA');
      await navegarFrio(`${BASE}/personal/tablero`, 'Tablero (JEFATURA)');
    });
  } finally {
    await navegador.close();
  }
  return resultados;
};

const mediana = (valores) => {
  const ordenados = valores.filter((v) => v !== null).sort((a, b) => a - b);
  if (ordenados.length === 0) {
    return null;
  }
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
};

const puntos = (valor) => (valor === null ? '—' : String(Math.round(valor * 100)));
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const main = async () => {
  const todas = [];
  for (const modo of MODOS) {
    for (let numero = 1; numero <= CORRIDAS; numero += 1) {
      console.log(`Corrida ${String(numero)}/${String(CORRIDAS)} en modo ${modo}…`);
      todas.push(...(await corrida(modo)));
    }
  }

  const claves = [...new Set(todas.map((r) => `${r.modo}|${r.pantalla}`))];
  const filas = claves.map((clave) => {
    const [modo, pantalla] = clave.split('|');
    const propias = todas.filter((r) => r.modo === modo && r.pantalla === pantalla);
    return {
      modo,
      pantalla,
      rendimiento: mediana(propias.map((r) => r.rendimiento)),
      accesibilidad: mediana(propias.map((r) => r.accesibilidad)),
      rendimientos: propias.map((r) => puntos(r.rendimiento)).join(', '),
      fallidas: [...new Set(propias.flatMap((r) => r.fallidas))],
      pesos: propias.find((r) => r.pesos !== null)?.pesos ?? null,
    };
  });

  const informe = [
    '# Medida de Lighthouse del portal (013)',
    '',
    `Fecha: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Sistema: ${BASE} (compose`,
    `aislado \`${PROYECTO}\`, sin el proveedor de IA). Lighthouse en modo móvil 360×740,`,
    `\`deviceScaleFactor: 2\`, con la mediana de ${String(CORRIDAS)} corridas por pantalla. Resultados tal`,
    'como salieron.',
    '',
    '| Pantalla | Modo | Rendimiento (mediana) | Corridas | Accesibilidad (mediana) | Auditorías de accesibilidad fallidas |',
    '| --- | --- | --- | --- | --- | --- |',
    ...filas.map(
      (f) =>
        `| ${f.pantalla} | ${f.modo} | ${puntos(f.rendimiento)} | ${f.rendimientos} | ${puntos(f.accesibilidad)} | ${f.fallidas.join(', ') || '—'} |`,
    ),
    '',
    'El chat abierto se mide en modo snapshot: Lighthouse no da rendimiento en ese modo.',
    '',
    '## Peso descargado (primera corrida de cada pantalla, con la caché vacía)',
    '',
    '| Pantalla | Modo | CSS transferido | CSS sin comprimir | JS transferido | JS sin comprimir |',
    '| --- | --- | --- | --- | --- | --- |',
    ...filas
      .filter((f) => f.pesos !== null)
      .map(
        (f) =>
          `| ${f.pantalla} | ${f.modo} | ${kb(f.pesos.css.transferido)} | ${kb(f.pesos.css.sinComprimir)} | ${kb(f.pesos.js.transferido)} | ${kb(f.pesos.js.sinComprimir)} |`,
      ),
    '',
  ].join('\n');

  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, informe);
  console.log(informe);
};

await main();
