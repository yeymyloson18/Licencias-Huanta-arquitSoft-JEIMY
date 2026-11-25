import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAVE_MODO } from './modo-color';

// public/modo-inicial.js (013, T049; plan B de research R-05): un script clásico externo en el
// <head> que aplica la elección guardada antes del primer pintado. Se prueba ejecutando el mismo
// archivo que sirve el portal.

const CODIGO = readFileSync(join(__dirname, '..', '..', 'public', 'modo-inicial.js'), 'utf8');
const html = () => document.documentElement;

/** Ejecuta el script como lo haría el navegador (un <script> en el documento). */
const ejecutar = () => {
  const script = document.createElement('script');
  script.textContent = CODIGO;
  document.head.appendChild(script);
  script.remove();
};

describe('public/modo-inicial.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    html().removeAttribute('data-coreui-theme');
  });

  it('usa la misma clave que modo-color.ts', () => {
    expect(CODIGO).toContain(`'${CLAVE_MODO}'`);
  });

  it.each([
    ['claro', 'light'],
    ['oscuro', 'dark'],
  ])('con "%s" guardado pone data-coreui-theme="%s"', (modo, atributo) => {
    localStorage.setItem(CLAVE_MODO, modo);

    ejecutar();

    expect(html()).toHaveAttribute('data-coreui-theme', atributo);
  });

  it.each([null, 'sistema', 'azul'])(
    'sin elección válida (%p) no pone atributo: el CSS sigue al dispositivo',
    (valor) => {
      if (valor !== null) {
        localStorage.setItem(CLAVE_MODO, valor);
      }

      ejecutar();

      expect(html()).not.toHaveAttribute('data-coreui-theme');
    },
  );

  it('si localStorage lanza un error, no falla ni pone atributo', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const errores = jest.fn();
    window.addEventListener('error', errores);

    ejecutar();

    window.removeEventListener('error', errores);
    expect(errores).not.toHaveBeenCalled();
    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });

  it('es un script clásico sin dependencias (sin import ni export)', () => {
    expect(CODIGO).not.toMatch(/^\s*(import|export)\s/m);
  });
});
