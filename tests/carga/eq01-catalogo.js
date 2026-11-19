// Prueba de carga de EQ-01 / SC-004 (funcionalidad 003, research.md §R-10): consulta pública del
// catálogo, la ficha y el asistente. Mezcla: 50 % lista, 30 % ficha y 20 % preguntas + propuesta.
//
// Ejecución (sin instalar k6; desde la raíz del repositorio, contra un stack aislado):
//   docker run --rm -i -e BASE=http://host.docker.internal:<puerto>/api/v1 \
//     -e USUARIOS=100 -e DURACION=2m grafana/k6:0.54.0 run - < tests/carga/eq01-catalogo.js
//
// Humo local: 100 usuarios durante 2 minutos. La meta de EQ-01 son 1,000 usuarios con p95 < 2 s y
// menos de 1 % de errores; esa medición vale en el entorno desplegado (README, "Resultados").

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://host.docker.internal:3000/api/v1';
const USUARIOS = Number(__ENV.USUARIOS || 100);
const DURACION = __ENV.DURACION || '2m';

export const options = {
  scenarios: {
    consulta_publica: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: USUARIOS },
        { duration: DURACION, target: USUARIOS },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const LICENCIAS = [
  'LIC-01',
  'LIC-02',
  'LIC-03',
  'LIC-04',
  'LIC-05',
  'LIC-06',
  'LIC-07',
  'LIC-08',
  'LIC-09',
];
const JSON_CABECERAS = { headers: { 'Content-Type': 'application/json' } };

const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const esOk = (respuesta, nombre) =>
  check(respuesta, { [`${nombre}: 200`]: (r) => r.status === 200 });

export default function () {
  const sorteo = Math.random();

  if (sorteo < 0.5) {
    esOk(
      http.get(`${BASE}/catalogo/recetas?tipo=LICENCIA`, { tags: { nombre: 'lista' } }),
      'lista',
    );
  } else if (sorteo < 0.8) {
    esOk(
      http.get(`${BASE}/catalogo/recetas/${alAzar(LICENCIAS)}`, { tags: { nombre: 'ficha' } }),
      'ficha',
    );
  } else {
    const preguntas = http.get(`${BASE}/asistente/preguntas`, { tags: { nombre: 'preguntas' } });
    if (esOk(preguntas, 'preguntas')) {
      // Una opción al azar por pregunta, tal como las da la API (el script no conoce las preguntas).
      const respuestas = {};
      for (const pregunta of preguntas.json()) {
        respuestas[pregunta.codigo] = alAzar(pregunta.opciones).valor;
      }
      esOk(
        http.post(`${BASE}/asistente/proponer`, JSON.stringify({ respuestas }), {
          ...JSON_CABECERAS,
          tags: { nombre: 'proponer' },
        }),
        'proponer',
      );
    }
  }

  // Tiempo de lectura de una persona entre una consulta y otra (1 a 3 s).
  sleep(1 + Math.random() * 2);
}
