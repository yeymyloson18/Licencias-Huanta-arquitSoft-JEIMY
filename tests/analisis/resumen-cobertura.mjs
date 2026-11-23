// Tabla de cobertura por módulo y capa (008, research §R-08). Lee los coverage-summary.json de la API
// y del portal y escribe Markdown en la salida estándar:
//   npm run cobertura -w apps/api && npm run cobertura -w apps/web
//   node tests/analisis/resumen-cobertura.mjs
// En el CI se agrega al resumen del job `cobertura`; aquí se usa para el README y el informe.
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');

const leer = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null);

/** Suma los totales de líneas y ramas de un grupo de archivos. */
const sumar = (archivos) =>
  archivos.reduce(
    (total, { lines, branches }) => ({
      lineas: {
        cubiertas: total.lineas.cubiertas + lines.covered,
        total: total.lineas.total + lines.total,
      },
      ramas: {
        cubiertas: total.ramas.cubiertas + branches.covered,
        total: total.ramas.total + branches.total,
      },
    }),
    { lineas: { cubiertas: 0, total: 0 }, ramas: { cubiertas: 0, total: 0 } },
  );

const porcentaje = ({ cubiertas, total }) =>
  total === 0 ? '—' : `${((cubiertas * 100) / total).toFixed(1)} %`;

const salida = [];

const api = leer(join(RAIZ, 'apps', 'api', 'coverage', 'coverage-summary.json'));
if (api !== null) {
  // Grupo: módulo (o compartido/operacion) y capa (dominio, aplicacion, infraestructura, presentacion).
  const grupos = new Map();
  for (const [ruta, datos] of Object.entries(api)) {
    if (ruta === 'total') continue;
    const partes = relative(join(RAIZ, 'apps', 'api', 'src'), ruta).split(sep);
    let modulo;
    let capa;
    if (partes[0] === 'modulos' || partes[0] === 'operacion') {
      modulo = partes[1];
      capa = ['dominio', 'aplicacion', 'infraestructura', 'presentacion'].includes(partes[2])
        ? partes[2]
        : 'raíz del módulo';
    } else if (partes[0] === 'compartido') {
      modulo = 'compartido';
      capa = partes[1];
    } else {
      modulo = '(arranque)';
      capa = '—';
    }
    const clave = `${modulo}|${capa}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), datos]);
  }
  salida.push('### Cobertura de la API por módulo y capa', '');
  salida.push('| Módulo | Capa | Líneas | Ramas |', '| --- | --- | --- | --- |');
  for (const clave of [...grupos.keys()].sort()) {
    const [modulo, capa] = clave.split('|');
    const { lineas, ramas } = sumar(grupos.get(clave));
    const marca = capa === 'dominio' || capa === 'aplicacion' ? ' (umbral 80 %)' : '';
    salida.push(`| ${modulo} | ${capa}${marca} | ${porcentaje(lineas)} | ${porcentaje(ramas)} |`);
  }
  const total = sumar([api.total]);
  salida.push(
    `| **Total** | | **${porcentaje(total.lineas)}** | **${porcentaje(total.ramas)}** |`,
    '',
  );

  const nucleo = sumar(
    Object.entries(api)
      .filter(([ruta]) => /[\\/](dominio|aplicacion)[\\/]/.test(ruta))
      .map(([, datos]) => datos),
  );
  salida.push(
    `Dominio y aplicación juntos: líneas ${porcentaje(nucleo.lineas)}, ramas ${porcentaje(nucleo.ramas)} (umbral: 80 % por archivo).`,
    '',
  );
}

const web = leer(join(RAIZ, 'apps', 'web', 'coverage', 'coverage-summary.json'));
if (web !== null) {
  const total = sumar([web.total]);
  salida.push(
    '### Cobertura del portal',
    '',
    `Líneas ${porcentaje(total.lineas)}, ramas ${porcentaje(total.ramas)} (sin umbral; se publica el reporte).`,
    '',
  );
}

if (salida.length === 0) {
  salida.push(
    'No hay reportes de cobertura: ejecute `npm run cobertura -w apps/api` y `-w apps/web`.',
  );
}
process.stdout.write(`${salida.join('\n')}\n`);
