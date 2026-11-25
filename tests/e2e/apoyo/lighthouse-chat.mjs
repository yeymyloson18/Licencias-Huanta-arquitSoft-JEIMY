// SC-007 de la 012 (FR-026, EQ-05): accesibilidad del chat de orientación ABIERTO, medida con
// Lighthouse en modo snapshot. Lighthouse CI recarga cada URL, así que el chat se cerraba antes de
// medir; con un flujo de puppeteer se abre "Pregúntanos" en la misma página y se mide sin recargar.
//
// No necesita al proveedor de IA (solo se abre el chat, no se pregunta nada). Uso:
//   node lighthouse-chat.mjs --url http://localhost:8080/ --salida <carpeta> [--chrome <ruta>]
// Requiere `lighthouse` y `puppeteer-core` instalados junto al script (en CI, en una carpeta
// temporal con versiones fijas; no van al package.json). Sale con código 1 si el puntaje es < 0.9.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startFlow } from 'lighthouse';
import puppeteer from 'puppeteer-core';

const argumento = (nombre, porDefecto) => {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 && process.argv[indice + 1] ? process.argv[indice + 1] : porDefecto;
};

const URL_PORTADA = argumento('--url', 'http://localhost:8080/');
const SALIDA = argumento('--salida', 'lighthouse-chat');
const CHROME = argumento('--chrome', process.env.CHROME_PATH ?? '/usr/bin/google-chrome');
const MINIMO = 0.9;

// Las mismas opciones móviles de las medidas anteriores (calidad-produccion.yml y la 011).
const configuracion = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['accessibility'],
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      disabled: false,
    },
  },
};

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const pagina = await navegador.newPage();
  await pagina.setViewport({
    width: 360,
    height: 740,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const flujo = await startFlow(pagina, {
    name: 'Chat de orientación abierto (012)',
    config: configuracion,
  });

  await flujo.navigate(URL_PORTADA, { name: 'Portada con el botón Pregúntanos' });
  await pagina.click('button.boton-preguntanos');
  await pagina.waitForSelector('dialog.chat-orientacion[open]');
  await flujo.snapshot({ name: 'Chat de orientación abierto' });

  const resultado = await flujo.createFlowResult();
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(join(SALIDA, 'chat-orientacion.html'), await flujo.generateReport());
  writeFileSync(join(SALIDA, 'chat-orientacion.json'), JSON.stringify(resultado, null, 2));

  let cumple = true;
  for (const paso of resultado.steps) {
    const puntaje = paso.lhr.categories.accessibility.score;
    const fallas = Object.values(paso.lhr.audits)
      .filter((auditoria) => auditoria.score === 0 && auditoria.scoreDisplayMode === 'binary')
      .map((auditoria) => auditoria.id);
    console.log(
      `${paso.name} (${paso.lhr.gatherMode}): accesibilidad ${String(puntaje)}` +
        (fallas.length > 0 ? ` · auditorías fallidas: ${fallas.join(', ')}` : ''),
    );
    cumple &&= puntaje !== null && puntaje >= MINIMO;
  }
  if (!cumple) {
    console.error(`Accesibilidad menor que ${String(MINIMO)}`);
    process.exitCode = 1;
  }
} finally {
  await navegador.close();
}
