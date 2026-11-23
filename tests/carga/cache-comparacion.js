// Latencia del catálogo con y sin Redis (008, research §R-06; docs/08-sprint-2/cache.md).
// El flujo carga-sprint2.yml lo ejecuta dos veces: con Redis y después de `docker compose stop redis`.
// Sin Redis, el catálogo sigue leyendo de PostgreSQL (la caché falla abierta en lecturas, ADR-005).
// 50 usuarios durante 1 minuto, solo lista y fichas del catálogo.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:8080/api/v1';
const LICENCIAS = ['LIC-01', 'LIC-02', 'LIC-03', 'LIC-04', 'LIC-05', 'LIC-09'];

export const options = {
  vus: Number(__ENV.USUARIOS || 50),
  duration: __ENV.DURACION || '1m',
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const respuesta =
    Math.random() < 0.5
      ? http.get(`${BASE}/catalogo/recetas?tipo=LICENCIA`, { tags: { nombre: 'lista' } })
      : http.get(
          `${BASE}/catalogo/recetas/${LICENCIAS[Math.floor(Math.random() * LICENCIAS.length)]}`,
          {
            tags: { nombre: 'ficha' },
          },
        );
  check(respuesta, { 'catálogo: 200': (r) => r.status === 200 });
  sleep(0.5 + Math.random());
}
