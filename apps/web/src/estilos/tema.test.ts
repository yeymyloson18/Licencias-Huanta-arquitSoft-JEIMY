/**
 * @jest-environment node
 */
import { join } from 'node:path';
import { compile } from 'sass';
import { COLORES } from './paleta';

// El tema compilado (013, US6; contracts/tema.md y research R-05): las variables oscuras siguen al
// sistema sin JavaScript, los colores son los de la Municipalidad y no entra nada que no se usa.

const RAIZ = join(__dirname, '..', '..', '..', '..');
const SISTEMA_OSCURO = '@media(prefers-color-scheme: dark)';

const compilar = (archivo: string): string =>
  compile(join(__dirname, archivo), {
    style: 'compressed',
    loadPaths: [join(RAIZ, 'node_modules')],
    silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
  }).css;

/** Un color de CSS (#rgb, #rrggbb, rgb(n, n, n) o rgb(n%, n%, n%)) en #rrggbb, o null. */
const aHex = (valor: string): string | null => {
  const texto = valor.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(texto)) {
    return texto;
  }
  if (/^#[0-9a-f]{3}$/.test(texto)) {
    return `#${Array.from(texto.slice(1), (c) => c + c).join('')}`;
  }
  const rgb = /^rgb\(([^)]*)\)$/.exec(texto);
  if (rgb === null) {
    return null;
  }
  const canales = (rgb[1] ?? '').split(',').map((parte) => {
    const numero = parseFloat(parte);
    return Math.round(parte.includes('%') ? (numero * 255) / 100 : numero);
  });
  return `#${canales.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/** Las declaraciones del primer bloque `selector{…}` del CSS (o de un trozo de él). */
const declaracionesDe = (css: string, selector: string): Map<string, string> => {
  const inicio = css.indexOf(`${selector}{`);
  if (inicio < 0) {
    return new Map();
  }
  const cuerpo = css.slice(inicio + selector.length + 1, css.indexOf('}', inicio));
  return new Map(
    cuerpo
      .split(';')
      .map((declaracion) => declaracion.split(':'))
      .filter((partes) => partes.length >= 2)
      .map(([nombre, ...valor]) => [(nombre ?? '').trim(), valor.join(':').trim()]),
  );
};

/** El contenido del bloque `@media (prefers-color-scheme: dark)` que trae las variables. */
const bloqueSistemaOscuro = (css: string): string => {
  let desde = 0;
  for (;;) {
    const inicio = css.indexOf(SISTEMA_OSCURO, desde);
    if (inicio < 0) {
      return '';
    }
    const bloque = css.slice(inicio, css.indexOf('}}', inicio) + 2);
    if (bloque.includes('--cui-body-bg')) {
      return bloque;
    }
    desde = inicio + 1;
  }
};

describe('tema.scss compilado', () => {
  let css = '';
  let oscuroElegido = new Map<string, string>();
  let oscuroSistema = new Map<string, string>();

  beforeAll(() => {
    css = compilar('tema.scss');
    oscuroElegido = declaracionesDe(css, '[data-coreui-theme=dark]');
    oscuroSistema = declaracionesDe(bloqueSistemaOscuro(css), ':root:not([data-coreui-theme])');
  }, 60_000);

  it('emite las variables oscuras bajo [data-coreui-theme=dark]', () => {
    expect(oscuroElegido.get('color-scheme')).toBe('dark');
    expect(aHex(oscuroElegido.get('--cui-body-bg') ?? '')).toBe(COLORES.oscuro.fondo.hex);
  });

  it('las emite también bajo prefers-color-scheme: dark sin elección guardada (sin JavaScript)', () => {
    expect(oscuroSistema.get('color-scheme')).toBe('dark');
    expect(aHex(oscuroSistema.get('--cui-body-bg') ?? '')).toBe(COLORES.oscuro.fondo.hex);
  });

  it('el bloque del sistema trae las mismas variables que el elegido', () => {
    for (const [nombre, valor] of oscuroElegido) {
      expect([nombre, oscuroSistema.get(nombre)]).toEqual([nombre, valor]);
    }
  });

  it('en oscuro, los enlaces usan el tinte claro del primario (R-07)', () => {
    expect(aHex(oscuroElegido.get('--cui-link-color') ?? '')).toBe(COLORES.oscuro.enlace.hex);
    expect(aHex(oscuroSistema.get('--cui-link-color') ?? '')).toBe(COLORES.oscuro.enlace.hex);
  });

  it('el primario es #0b5394 en los dos modos (botones con texto blanco, 7.8:1)', () => {
    expect(
      aHex(declaracionesDe(css, ':root,[data-coreui-theme=light]').get('--cui-primary') ?? ''),
    ).toBe(COLORES.primario.hex);
    expect(aHex(oscuroElegido.get('--cui-primary') ?? '')).toBe(COLORES.primario.hex);
  });

  it('usa #f2a900 en el foco', () => {
    expect(css).toContain(COLORES.foco.hex);
  });

  it.each(['.modal', '.toast', '.carousel', '.offcanvas', '.accordion', '.progress', '.popover'])(
    'no trae reglas de %s (no se importa)',
    (selector) => {
      expect(css).not.toMatch(new RegExp(`\\${selector}\\b`));
    },
  );

  // .boton y .boton--secundario van juntos en las pantallas: el contorno tiene que dejar el fondo
  // transparente, o el texto queda del mismo color que el fondo (encontrado en la fase 8).
  it('el botón secundario (.boton.boton--secundario) tiene fondo transparente', () => {
    expect(declaracionesDe(css, ':root .boton.boton--secundario').get('--cui-btn-bg')).toBe(
      'transparent',
    );
  });

  it('en oscuro, el contorno primario usa el tinte claro', () => {
    const bloque = declaracionesDe(
      css,
      ':root[data-coreui-theme=dark] .btn-outline-primary,:root[data-coreui-theme=dark] .boton--secundario',
    );
    expect(bloque.get('--cui-btn-color')).toBe('var(--cui-link-color)');
  });

  it('no carga nada de otro dominio', () => {
    expect(css).not.toContain('@import');
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
  });
});
