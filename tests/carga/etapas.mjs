// Tabla por etapa de la carga del Sprint 2 (008) a partir del resumen de k6 (--summary-export):
//   node tests/carga/etapas.mjs resultados/resumen.json [resultados/cache-con.json resultados/cache-sin.json]
// Escribe Markdown: peticiones, p50, p95, p99 y errores de cada etapa, y si superó los umbrales de
// EQ-01 (p95 < 2 s y errores < 1 %). Con los resúmenes de caché agrega la comparación con y sin Redis.
import { existsSync, readFileSync } from 'node:fs';

const [rutaResumen, rutaCon, rutaSin] = process.argv.slice(2);
if (!rutaResumen) {
  console.error('Uso: node tests/carga/etapas.mjs <resumen.json> [cache-con.json cache-sin.json]');
  process.exit(64);
}

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8')).metrics;
const ms = (valor) => Math.floor(valor ?? 0);
const pct = (tasa) => `${(Math.round((tasa ?? 0) * 10000) / 100).toFixed(2)} %`;

const metricas = leer(rutaResumen);
const etapas = [
  ...new Set(
    Object.keys(metricas)
      .map((clave) => /^http_req_duration\{etapa:(\d+)\}$/.exec(clave)?.[1])
      .filter(Boolean),
  ),
].sort();

const lineas = [
  '### Carga progresiva hasta 2,000 usuarios (EQ-01)',
  '',
  '| Usuarios | Peticiones | p50 (ms) | p95 (ms) | p99 (ms) | Errores | Estado |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
let superadas = 0;
for (const etapa of etapas) {
  const duracion = metricas[`http_req_duration{etapa:${etapa}}`] ?? {};
  const errores = metricas[`http_req_failed{etapa:${etapa}}`]?.value ?? 0;
  const peticiones = metricas[`http_reqs{etapa:${etapa}}`]?.count ?? 0;
  const cumple = (duracion['p(95)'] ?? 0) < 2000 && errores < 0.01;
  if (!cumple) superadas += 1;
  lineas.push(
    `| ${Number(etapa)} | ${peticiones} | ${ms(duracion.med)} | ${ms(duracion['p(95)'])} | ${ms(duracion['p(99)'])} | ${pct(errores)} | ${cumple ? 'cumple' : 'umbral superado'} |`,
  );
}
lineas.push(
  '',
  `Total: ${metricas.http_reqs?.count ?? 0} peticiones, p95 ${ms(metricas.http_req_duration?.['p(95)'])} ms, errores ${pct(metricas.http_req_failed?.value)}.`,
);
if (superadas > 0) {
  lineas.push(
    '',
    `**${superadas} etapa(s) superaron los umbrales de EQ-01.** Ver docs/08-sprint-2/atributos-de-calidad.md: el ejecutor comparte el procesador entre k6 y el sistema.`,
  );
}

if (rutaCon && rutaSin && existsSync(rutaCon) && existsSync(rutaSin)) {
  lineas.push(
    '',
    '### Catálogo con y sin Redis (50 usuarios, 1 minuto)',
    '',
    '| Caché | Peticiones | p50 (ms) | p95 (ms) | Errores |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const [nombre, ruta] of [
    ['con Redis', rutaCon],
    ['sin Redis (PostgreSQL directo)', rutaSin],
  ]) {
    const m = leer(ruta);
    lineas.push(
      `| ${nombre} | ${m.http_reqs?.count ?? 0} | ${ms(m.http_req_duration?.med)} | ${ms(m.http_req_duration?.['p(95)'])} | ${pct(m.http_req_failed?.value)} |`,
    );
  }
}
process.stdout.write(`${lineas.join('\n')}\n`);
