// Comprueba las citas de los documentos del Sprint 2 (008, quickstart):
//   node tests/analisis/verificar-citas.mjs [docs/08-sprint-2]
// - Cada ruta del repositorio entre comillas invertidas (`apps/...`, `tests/...`, `infra/...`,
//   `docs/...`, `.github/...`) existe.
// - Cada fragmento citado como «`...`» aparece literalmente en alguno de los archivos citados en la
//   misma línea.
// - Cada enlace relativo [texto](ruta) apunta a un archivo o carpeta que existe.
// Sale con 1 si algo falla, con la lista de problemas.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');
const carpeta = resolve(RAIZ, process.argv[2] ?? 'docs/08-sprint-2');
const RUTA = /`((?:apps|tests|infra|docs|packages|\.github)\/[^`\s]+?)`/g;
const FRAGMENTO = /«`([^`]+)`»/g;
const ENLACE = /\[[^\]]*\]\(([^)#\s]+)(?:#[^)]*)?\)/g;

const problemas = [];
let revisadas = 0;

for (const nombre of readdirSync(carpeta).filter((archivo) => archivo.endsWith('.md'))) {
  const documento = join(carpeta, nombre);
  const lineas = readFileSync(documento, 'utf8').split('\n');
  lineas.forEach((linea, indice) => {
    const donde = `${nombre}:${indice + 1}`;
    const rutas = [...linea.matchAll(RUTA)].map((m) => m[1].replace(/\/$/, ''));
    for (const ruta of rutas) {
      revisadas += 1;
      if (!existsSync(join(RAIZ, ruta))) problemas.push(`${donde}: no existe ${ruta}`);
    }
    for (const [, fragmento] of linea.matchAll(FRAGMENTO)) {
      revisadas += 1;
      const archivos = rutas
        .map((ruta) => join(RAIZ, ruta))
        .filter((ruta) => existsSync(ruta) && statSync(ruta).isFile());
      if (archivos.length === 0) {
        problemas.push(
          `${donde}: el fragmento «${fragmento}» no tiene un archivo en la misma línea`,
        );
        continue;
      }
      if (!archivos.some((archivo) => readFileSync(archivo, 'utf8').includes(fragmento))) {
        problemas.push(`${donde}: «${fragmento}» no aparece en ${rutas.join(', ')}`);
      }
    }
    for (const [, enlace] of linea.matchAll(ENLACE)) {
      if (/^[a-z]+:/i.test(enlace)) continue; // http:, https:, mailto:
      revisadas += 1;
      if (!existsSync(resolve(dirname(documento), enlace))) {
        problemas.push(`${donde}: el enlace ${enlace} no existe`);
      }
    }
  });
}

if (problemas.length > 0) {
  console.error(problemas.join('\n'));
  console.error(`\n${problemas.length} cita(s) con problemas de ${revisadas} revisadas.`);
  process.exit(1);
}
console.log(`OK: ${revisadas} citas y enlaces revisados en ${carpeta.replace(RAIZ, '.')}.`);
