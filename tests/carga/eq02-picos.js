// Prueba de picos de EQ-02 (funcionalidad 007, research §R-13): consulta pública del catálogo y del
// estado con usuarios que suben por etapas (100 → 500 → 1,000). Se ejecuta con 1 y con 2 réplicas de
// la API (flujo k6.yml) para comparar. En un servidor de 2 GB, 10,000 usuarios no son alcanzables;
// el límite queda documentado en docs/07-despliegue/resultados.md. Datos FICTICIOS.
//
//   docker run --rm -i -e BASE=https://<dominio>/api/v1 -e NUMEROS=EXP-2026-000001 \
//     -e DOCUMENTO=41000001 grafana/k6:0.54.0 run - < tests/carga/eq02-picos.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://host.docker.internal:3000/api/v1';
const NUMEROS = (__ENV.NUMEROS || '').split(',').filter((numero) => numero !== '');
const DOCUMENTO = __ENV.DOCUMENTO || '41000001';
const ESCALA = Number(__ENV.ESCALA || 1);

export const options = {
  scenarios: {
    picos: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 * ESCALA },
        { duration: '1m', target: 100 * ESCALA },
        { duration: '30s', target: 500 * ESCALA },
        { duration: '1m', target: 500 * ESCALA },
        { duration: '30s', target: 1000 * ESCALA },
        { duration: '2m', target: 1000 * ESCALA },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // EQ-02 pide p95 ≤ 3 s y menos de 1 % de errores en el pico.
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

const LICENCIAS = ['LIC-01', 'LIC-02', 'LIC-03', 'LIC-09'];
const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const esOk = (respuesta, nombre) =>
  check(respuesta, { [`${nombre}: 200`]: (r) => r.status === 200 });

export default function () {
  const sorteo = Math.random();
  if (sorteo < 0.5 || NUMEROS.length === 0) {
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
    esOk(
      http.post(
        `${BASE}/expedientes/consultar`,
        JSON.stringify({ numeroExpediente: alAzar(NUMEROS), documento: DOCUMENTO }),
        { headers: { 'Content-Type': 'application/json' }, tags: { nombre: 'consulta' } },
      ),
      'consulta',
    );
  }
  sleep(1 + Math.random() * 2);
}
