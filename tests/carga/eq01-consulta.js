// Prueba de carga de EQ-01 / SC-002 (funcionalidad 004, research.md §R-12): consulta pública del
// estado con datos correctos de expedientes sembrados (FICTICIOS).
//
// El límite de la consulta reserva un intento por origen antes de buscar y lo libera si acierta;
// para medir la API y no ese límite, cada usuario virtual simula su propio origen con
// `X-Forwarded-For` (k6 se conecta directo al puerto de la API, que confía en un salto de proxy).
//
// Ejecución (sin instalar k6; desde la raíz del repositorio, contra un stack aislado):
//   docker run --rm -i -e BASE=http://host.docker.internal:<puerto-api>/api/v1 \
//     -e NUMEROS=EXP-2026-000001,EXP-2026-000002 -e DOCUMENTO=40000001 \
//     -e USUARIOS=100 -e DURACION=2m grafana/k6:0.54.0 run - < tests/carga/eq01-consulta.js
//
// Mismos umbrales que eq01-catalogo.js: p95 < 2 s y menos de 1 % de errores.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://host.docker.internal:3000/api/v1';
const USUARIOS = Number(__ENV.USUARIOS || 100);
const DURACION = __ENV.DURACION || '2m';
const NUMEROS = (__ENV.NUMEROS || '').split(',').filter((numero) => numero !== '');
const DOCUMENTO = __ENV.DOCUMENTO || '40000001';

export const options = {
  scenarios: {
    consulta_estado: {
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

export function setup() {
  if (NUMEROS.length === 0) {
    throw new Error('Indica los expedientes sembrados en NUMEROS (separados por comas)');
  }
}

/** Un origen distinto por usuario virtual, dentro de 10.0.0.0/8 (direcciones de prueba). */
const origenDe = (vu) =>
  `10.${String((vu >> 16) & 255)}.${String((vu >> 8) & 255)}.${String(vu & 255)}`;

export default function () {
  const numero = NUMEROS[Math.floor(Math.random() * NUMEROS.length)];
  const respuesta = http.post(
    `${BASE}/expedientes/consultar`,
    JSON.stringify({ numeroExpediente: numero, documento: DOCUMENTO }),
    {
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': origenDe(__VU) },
      tags: { nombre: 'consultar' },
    },
  );
  check(respuesta, {
    'consultar: 200': (r) => r.status === 200,
    'consultar: sin caché': (r) => r.headers['Cache-Control'] === 'no-store',
  });

  // Tiempo de lectura de una persona entre una consulta y otra (1 a 3 s).
  sleep(1 + Math.random() * 2);
}
