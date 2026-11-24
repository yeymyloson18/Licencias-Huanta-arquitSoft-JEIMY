// Carga progresiva del Sprint 2 hasta 2,000 usuarios virtuales (008, research §R-06; EQ-01 y EQ-02).
// Corre en GitHub Actions (.github/workflows/carga-sprint2.yml), nunca en la computadora de la usuaria.
//
//   docker run --rm --network host -v "$PWD/tests/carga:/scripts" -e BASE=http://localhost:8080/api/v1 \
//     -e PARES=EXP-2026-000001:41000001 grafana/k6:0.54.0 run /scripts/sprint2-progresivo.js
//
// Etapas: 100 → 500 → 1,000 → 1,500 → 2,000 usuarios simultáneos (subida gradual, meseta en 2,000 y
// bajada). Mezcla de operaciones públicas: 35 % lista del catálogo, 25 % ficha, 15 % asistente
// (preguntas + propuesta) y 25 % consulta del estado de expedientes sembrados (datos FICTICIOS).
// Cada petición lleva la etiqueta `etapa` según los usuarios activos, y hay umbrales por etapa: así el
// resumen (--summary-export) trae el p95 y los errores de cada escalón sin guardar cada petición.
// Cada usuario simula su propio origen con X-Forwarded-For (el compose de carga confía en 2 saltos):
// se mide el sistema y no el límite de intentos por origen de la consulta.

import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:8080/api/v1';
const MAXIMO = Number(__ENV.USUARIOS_MAX || 2000);
const PARES = (__ENV.PARES || '')
  .split(',')
  .filter((par) => par.includes(':'))
  .map((par) => {
    const [numeroExpediente, documento] = par.split(':');
    return { numeroExpediente, documento };
  });

const ETAPAS = [100, 500, 1000, 1500, 2000].filter((usuarios) => usuarios <= MAXIMO);
const nombreEtapa = (usuarios) => String(usuarios).padStart(4, '0');

const umbralesPorEtapa = {};
for (const usuarios of ETAPAS) {
  umbralesPorEtapa[`http_req_duration{etapa:${nombreEtapa(usuarios)}}`] = ['p(95)<2000'];
  umbralesPorEtapa[`http_req_failed{etapa:${nombreEtapa(usuarios)}}`] = ['rate<0.01'];
  umbralesPorEtapa[`http_reqs{etapa:${nombreEtapa(usuarios)}}`] = ['count>=0'];
}

export const options = {
  scenarios: {
    progresivo: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.min(100, MAXIMO) },
        { duration: '1m', target: Math.min(100, MAXIMO) },
        { duration: '1m', target: Math.min(500, MAXIMO) },
        { duration: '1m', target: Math.min(1000, MAXIMO) },
        { duration: '1m', target: Math.min(1500, MAXIMO) },
        { duration: '1m', target: MAXIMO },
        { duration: '3m', target: MAXIMO },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    // EQ-01: el 95 % en 2 s o menos y menos del 1 % de errores.
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    ...umbralesPorEtapa,
  },
};

const LICENCIAS = ['LIC-01', 'LIC-02', 'LIC-03', 'LIC-04', 'LIC-05', 'LIC-09'];
const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];

/** La etapa a la que pertenece este momento: el escalón más chico que cubre los usuarios activos. */
const etapaActual = () => {
  const activos = exec.instance.vusActive;
  const escalon = ETAPAS.find((usuarios) => activos <= usuarios) ?? ETAPAS[ETAPAS.length - 1];
  return nombreEtapa(escalon);
};

/** Un origen ficticio estable por usuario virtual (198.18.0.0/15, reservado para pruebas). */
const origen = () => {
  const id = exec.vu.idInTest;
  return `198.18.${Math.floor(id / 250) % 256}.${(id % 250) + 1}`;
};

const opciones = (nombre, extra = {}) => ({
  ...extra,
  headers: { 'X-Forwarded-For': origen(), ...(extra.headers || {}) },
  tags: { nombre, etapa: etapaActual() },
});

// Respuestas fallidas por código (0 = sin respuesta: conexión rechazada, cortada o tiempo agotado).
// Aparecen en el resumen de k6 y explican en qué capa se degrada el sistema.
const fallas = {
  0: new Counter('fallas_sin_respuesta'),
  429: new Counter('fallas_429'),
  500: new Counter('fallas_500'),
  502: new Counter('fallas_502'),
  503: new Counter('fallas_503'),
  504: new Counter('fallas_504'),
};
const otrasFallas = new Counter('fallas_otras');

const ok = (respuesta, nombre) => {
  const correcto = check(respuesta, { [`${nombre}: 200`]: (r) => r.status === 200 });
  if (!correcto) {
    (fallas[respuesta.status] ?? otrasFallas).add(1, { etapa: etapaActual() });
  }
  return correcto;
};

export default function () {
  const sorteo = Math.random();
  if (sorteo < 0.35) {
    ok(http.get(`${BASE}/catalogo/recetas?tipo=LICENCIA`, opciones('lista')), 'lista');
  } else if (sorteo < 0.6) {
    ok(http.get(`${BASE}/catalogo/recetas/${alAzar(LICENCIAS)}`, opciones('ficha')), 'ficha');
  } else if (sorteo < 0.75 || PARES.length === 0) {
    const preguntas = http.get(`${BASE}/asistente/preguntas`, opciones('preguntas'));
    if (ok(preguntas, 'preguntas')) {
      const respuestas = {};
      for (const pregunta of preguntas.json()) {
        respuestas[pregunta.codigo] = alAzar(pregunta.opciones).valor;
      }
      ok(
        http.post(
          `${BASE}/asistente/proponer`,
          JSON.stringify({ respuestas }),
          opciones('proponer', { headers: { 'Content-Type': 'application/json' } }),
        ),
        'proponer',
      );
    }
  } else {
    ok(
      http.post(
        `${BASE}/expedientes/consultar`,
        JSON.stringify(alAzar(PARES)),
        opciones('consulta', { headers: { 'Content-Type': 'application/json' } }),
      ),
      'consulta',
    );
  }
  // Tiempo de lectura de una persona entre una consulta y otra (1 a 3 s).
  sleep(1 + Math.random() * 2);
}
