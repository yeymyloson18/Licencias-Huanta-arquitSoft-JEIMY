import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSP_DOCUMENTACION } from '../../../../src/operacion/documentacion/documentacion';

// SC-003 de la 008: solo /api/docs tiene la CSP ajustada; el portal (nginx) y producción (Caddy)
// conservan la estricta en todas las demás rutas. Se comprueba la configuración sin levantar nada.

const RAIZ = join(__dirname, '..', '..', '..', '..', '..', '..');
const leer = (...ruta: string[]) => readFileSync(join(RAIZ, ...ruta), 'utf8');
const CSP_ESTRICTA =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const cspDe = (texto: string): string[] =>
  [...texto.matchAll(/Content-Security-Policy "([^"]+)"/g)].map(
    (coincidencia) => coincidencia[1] ?? '',
  );

const ordenada = (csp: string) => csp.split('; ').sort().join('; ');

describe('Cabeceras de la documentación en nginx y Caddy (008)', () => {
  it('la CSP estricta del portal no cambió', () => {
    expect(cspDe(leer('apps', 'web', 'cabeceras-seguridad.conf')).map(ordenada)).toEqual([
      ordenada(CSP_ESTRICTA),
    ]);
  });

  it('nginx: solo location /api/docs usa cabeceras-docs.conf; las demás, la estricta', () => {
    const nginx = leer('apps', 'web', 'nginx.conf');
    const bloques = [...nginx.matchAll(/location (\S+) \{([^}]*)\}/g)].map((bloque) => ({
      ruta: bloque[1],
      cuerpo: bloque[2] ?? '',
    }));

    expect(bloques.map((b) => b.ruta)).toEqual(['/api/docs', '/api/', '/assets/', '/']);
    for (const bloque of bloques) {
      const esDocs = bloque.ruta === '/api/docs';
      expect(bloque.cuerpo.includes('cabeceras-docs.conf')).toBe(esDocs);
      expect(bloque.cuerpo.includes('cabeceras-seguridad.conf')).toBe(!esDocs);
    }
    expect(cspDe(leer('apps', 'web', 'cabeceras-docs.conf'))).toEqual([CSP_DOCUMENTACION]);
  });

  it('Caddy: la CSP general sigue estricta y solo handle /api/docs* tiene la de la documentación', () => {
    const caddy = leer('infra', 'produccion', 'Caddyfile');

    expect(cspDe(caddy).map(ordenada)).toEqual([
      ordenada(CSP_ESTRICTA),
      ordenada(CSP_DOCUMENTACION),
    ]);
    const bloqueDocs = caddy.slice(
      caddy.indexOf('handle /api/docs*'),
      caddy.indexOf('handle /api/*'),
    );
    expect(bloqueDocs).toContain(CSP_DOCUMENTACION);
  });

  it('la imagen de la API incluye el contrato para /api/docs', () => {
    expect(leer('apps', 'api', 'Dockerfile')).toContain(
      'COPY --chown=node:node docs/06-contrato-api/openapi.yaml ./contrato/openapi.yaml',
    );
  });
});
