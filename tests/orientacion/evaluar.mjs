// Evaluación del escenario EQ-08 (exactitud de la orientación, 012). Envía cada pregunta de
// preguntas-prueba.json al chat de la API levantada (con el proveedor real configurado en
// infra/.env) y escribe el informe con los resultados TAL COMO SALEN:
//   node tests/orientacion/evaluar.mjs [--url http://localhost:8080] [--pausa 20000]
//                                      [--salida docs/08-sprint-2/evidencias/orientacion-eq08.md]
// Este script NUNCA lee infra/.env ni conoce la clave: solo habla con la API por HTTP. Correr contra un
// sistema con ORIENTACION_LIMITE_PREGUNTAS alto (10 cada 15 minutos no alcanza para el conjunto).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');

const argumento = (nombre, porDefecto) => {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 && process.argv[indice + 1] ? process.argv[indice + 1] : porDefecto;
};

const BASE = argumento('--url', process.env.E2E_URL ?? 'http://localhost:8080');
const API = `${BASE.replace(/\/+$/, '')}/api/v1`;
// Pausa entre preguntas para respetar los límites por minuto del nivel gratuito del proveedor.
const PAUSA_MS = Number(argumento('--pausa', '20000'));
const SALIDA = join(
  RAIZ,
  argumento('--salida', join('docs', '08-sprint-2', 'evidencias', 'orientacion-eq08.md')),
);
const LIMITE_SC005_MS = 10_000;

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

const sinTildes = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Montos (`177.10`) y plazos (`2 dias`, `12 meses`, `2 anos`), con la misma forma que el dominio. */
const extraerCifras = (texto) => {
  const base = sinTildes(texto);
  const cifras = new Set();
  const numero = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
  for (const patron of [
    new RegExp(String.raw`s\/\.?\s*${numero}`, 'g'),
    new RegExp(String.raw`(?<![\d.,])${numero}\s*soles\b`, 'g'),
  ]) {
    for (const [, entero, decimales = ''] of base.matchAll(patron)) {
      cifras.add(`${entero.replace(/,/g, '')}.${decimales.padEnd(2, '0')}`);
    }
  }
  for (const [, cantidad, unidad] of base.matchAll(
    /(?<![\d.,])(\d+)\s*(dias?|mes(?:es)?|anos?)\b/g,
  )) {
    const normal = unidad.startsWith('dia') ? 'dias' : unidad.startsWith('mes') ? 'meses' : 'anos';
    cifras.add(`${cantidad} ${normal}`);
  }
  return [...cifras];
};

const pedirJson = async (ruta) => {
  const respuesta = await fetch(`${API}${ruta}`);
  if (!respuesta.ok) {
    throw new Error(`GET ${ruta} respondió ${String(respuesta.status)}`);
  }
  return respuesta.json();
};

/** Montos y plazos que una respuesta puede mencionar: catálogo vigente y guía (como la revisión). */
const cifrasDelSistema = async () => {
  const permitidas = new Set();
  const licencias = await pedirJson('/catalogo/recetas?tipo=LICENCIA');
  for (const { codigo } of licencias) {
    const ficha = await pedirJson(`/catalogo/recetas/${codigo}`);
    permitidas.add(Number(ficha.tasa).toFixed(2));
    for (const dias of [ficha.plazoDias, ficha.plazoItseDias]) {
      if (typeof dias === 'number') {
        permitidas.add(`${String(dias)} dias`);
      }
    }
    if (typeof ficha.vigenciaMeses === 'number') {
      permitidas.add(`${String(ficha.vigenciaMeses)} meses`);
    }
    for (const requisito of ficha.requisitos ?? []) {
      for (const cifra of extraerCifras(requisito.descripcion ?? '')) {
        permitidas.add(cifra);
      }
    }
  }
  permitidas.add('6 meses');
  const guia = JSON.parse(
    readFileSync(
      join(
        RAIZ,
        'apps',
        'api',
        'src',
        'modulos',
        'orientacion',
        'infraestructura',
        'guia',
        'guia-orientacion.json',
      ),
      'utf8',
    ),
  );
  for (const tema of guia.temas) {
    for (const cifra of extraerCifras(tema.respuesta)) {
      permitidas.add(cifra);
    }
  }
  return permitidas;
};

/** Una pregunta, con reintentos ante el límite propio (429) o el proveedor no disponible. */
const preguntar = async (caso) => {
  let reintentos = 0;
  for (;;) {
    const inicio = performance.now();
    const respuesta = await fetch(`${API}/orientacion/preguntas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: caso.pregunta, historial: caso.historial ?? [] }),
    });
    const ms = Math.round(performance.now() - inicio);
    if (respuesta.status === 429 && reintentos < 2) {
      reintentos += 1;
      await esperar((Number(respuesta.headers.get('Retry-After')) || 60) * 1000 + 1000);
      continue;
    }
    if (respuesta.status !== 200) {
      return { estado: respuesta.status, ms, reintentos, cuerpo: null };
    }
    const cuerpo = await respuesta.json();
    // Cuota por minuto del nivel gratuito: se espera un minuto y se reintenta una vez.
    if (cuerpo.resultado === 'NO_DISPONIBLE' && reintentos < 1) {
      reintentos += 1;
      await esperar(60_000);
      continue;
    }
    return { estado: 200, ms, reintentos, cuerpo };
  }
};

const evaluar = (caso, obtenido, permitidas) => {
  const esperados = [caso.resultadoEsperado].flat();
  const cuerpo = obtenido.cuerpo;
  if (cuerpo === null) {
    return { acierto: false, motivos: [`HTTP ${String(obtenido.estado)}`], ajenas: [] };
  }
  const motivos = [];
  if (!esperados.includes(cuerpo.resultado)) {
    motivos.push(`resultado ${cuerpo.resultado}`);
  }
  const fichas = cuerpo.enlaces.filter((e) => e.tipo === 'FICHA').map((e) => e.codigoReceta);
  for (const codigo of caso.codigosReceta ?? []) {
    if (!fichas.includes(codigo)) {
      motivos.push(`falta la ficha ${codigo}`);
    }
  }
  const cifras = extraerCifras(cuerpo.texto);
  for (const cifra of caso.cifrasEsperadas ?? []) {
    if (!cifras.includes(cifra)) {
      motivos.push(`falta ${cifra}`);
    }
  }
  for (const cifra of caso.cifrasProhibidas ?? []) {
    if (cifras.includes(cifra)) {
      motivos.push(`aparece ${cifra}`);
    }
  }
  for (const texto of caso.textoContiene ?? []) {
    if (!sinTildes(cuerpo.texto).includes(sinTildes(texto))) {
      motivos.push(`no dice "${texto}"`);
    }
  }
  if (caso.datoPersonalQuitado === true && cuerpo.datoPersonalQuitado !== true) {
    motivos.push('no avisó del dato personal');
  }
  const ajenas = cifras.filter((cifra) => !permitidas.has(cifra));
  return { acierto: motivos.length === 0, motivos, ajenas };
};

const percentil = (valores, p) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
};

const porcentaje = (parte, total) =>
  total === 0 ? '—' : `${((100 * parte) / total).toFixed(1).replace(/\.0$/, '')} %`;

const celda = (texto) => String(texto).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const main = async () => {
  const conjunto = JSON.parse(
    readFileSync(join(import.meta.dirname, 'preguntas-prueba.json'), 'utf8'),
  );
  const permitidas = await cifrasDelSistema();
  const filas = [];
  for (const [indice, caso] of conjunto.preguntas.entries()) {
    if (indice > 0) {
      await esperar(PAUSA_MS);
    }
    const obtenido = await preguntar(caso);
    const evaluacion = evaluar(caso, obtenido, permitidas);
    filas.push({ caso, obtenido, ...evaluacion });
    console.log(
      `${String(indice + 1).padStart(2)}/${String(conjunto.preguntas.length)} ${caso.id}: ` +
        `${obtenido.cuerpo?.resultado ?? `HTTP ${String(obtenido.estado)}`} ` +
        `${evaluacion.acierto ? 'OK' : `FALLA (${evaluacion.motivos.join('; ')})`} ${String(obtenido.ms)} ms`,
    );
  }

  const aciertos = filas.filter((f) => f.acierto).length;
  const mostradasConAjenas = filas.filter(
    (f) => f.obtenido.cuerpo?.resultado === 'RESPONDIDA' && f.ajenas.length > 0,
  );
  const fuera = filas.filter((f) => f.caso.categoria === 'fuera-de-tema');
  const fueraRechazadas = fuera.filter((f) => f.obtenido.cuerpo?.resultado === 'FUERA_DE_TEMA');
  const tiempos = filas.map((f) => f.obtenido.ms);
  const rapidas = tiempos.filter((ms) => ms <= LIMITE_SC005_MS).length;
  const noDisponibles = filas.filter((f) => f.obtenido.cuerpo?.resultado === 'NO_DISPONIBLE');
  const reintentos = filas.reduce((total, f) => total + f.obtenido.reintentos, 0);

  const informe = [
    '# Evaluación EQ-08: exactitud del chat de orientación (012)',
    '',
    `Fecha: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Sistema: ${BASE} (Docker`,
    'Compose local con el proveedor real configurado en `infra/.env`; la clave no se lee ni se muestra).',
    `Conjunto: \`tests/orientacion/preguntas-prueba.json\` (${String(filas.length)} preguntas). Pausa entre`,
    `preguntas: ${String(PAUSA_MS / 1000)} s. Resultados tal como salieron, sin corregir.`,
    '',
    '## Totales',
    '',
    '| Medida | Meta | Resultado | ¿Cumple? |',
    '| --- | --- | --- | --- |',
    `| SC-001 respuestas que coinciden con lo esperado | ≥ 90 % | ${String(aciertos)} de ${String(filas.length)} (${porcentaje(aciertos, filas.length)}) | ${aciertos / filas.length >= 0.9 ? 'Sí' : 'No'} |`,
    `| SC-002 respuestas mostradas con cifras ajenas al catálogo o la guía | 0 | ${String(mostradasConAjenas.length)} | ${mostradasConAjenas.length === 0 ? 'Sí' : 'No'} |`,
    `| SC-003 preguntas fuera del tema o de manipulación rechazadas | 100 % | ${String(fueraRechazadas.length)} de ${String(fuera.length)} (${porcentaje(fueraRechazadas.length, fuera.length)}) | ${fueraRechazadas.length === fuera.length ? 'Sí' : 'No'} |`,
    `| SC-005 respuestas en 10 s o menos | ≥ 95 % | ${String(rapidas)} de ${String(tiempos.length)} (${porcentaje(rapidas, tiempos.length)}); p95 ${String(percentil(tiempos, 95))} ms | ${rapidas / tiempos.length >= 0.95 ? 'Sí' : 'No'} |`,
    '',
    `Respuestas NO_DISPONIBLE (proveedor caído o cuota agotada, después de reintentar): ${String(noDisponibles.length)}.`,
    `Reintentos hechos por el evaluador (límite propio o proveedor no disponible): ${String(reintentos)}.`,
    'SC-004 (datos personales) no se mide aquí: lo comprueba la prueba `privacidad-012` con un',
    'proveedor simulado que guarda lo que recibe.',
    '',
    '## Detalle por pregunta',
    '',
    '| # | Pregunta | Categoría | Esperado | Obtenido | Fichas | Cifras ajenas | ms | ¿Acierta? |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...filas
      .map((f, indice) =>
        [
          String(indice + 1),
          celda(f.caso.pregunta),
          f.caso.categoria,
          [f.caso.resultadoEsperado].flat().join(' o '),
          f.obtenido.cuerpo?.resultado ?? `HTTP ${String(f.obtenido.estado)}`,
          (f.obtenido.cuerpo?.enlaces ?? [])
            .filter((e) => e.tipo === 'FICHA')
            .map((e) => e.codigoReceta)
            .join(', ') || '—',
          f.ajenas.join(', ') || '—',
          String(f.obtenido.ms),
          f.acierto ? 'Sí' : `No: ${celda(f.motivos.join('; '))}`,
        ].join(' | '),
      )
      .map((linea) => `| ${linea} |`),
    '',
    '## Respuestas',
    '',
    ...filas.flatMap((f, indice) => [
      `${String(indice + 1)}. **${celda(f.caso.pregunta)}** → ${f.obtenido.cuerpo?.resultado ?? `HTTP ${String(f.obtenido.estado)}`}: ${celda(f.obtenido.cuerpo?.texto ?? '')}`,
    ]),
    '',
  ].join('\n');

  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, informe);
  console.log(
    `\nSC-001 ${porcentaje(aciertos, filas.length)} · SC-002 ${String(mostradasConAjenas.length)} con cifras ajenas · ` +
      `SC-003 ${porcentaje(fueraRechazadas.length, fuera.length)} · SC-005 p95 ${String(percentil(tiempos, 95))} ms`,
  );
  console.log(`Informe: ${SALIDA}`);
};

await main();
