import {
  aplicarModo,
  aplicarModoGuardado,
  CLAVE_MODO,
  guardarModo,
  leerModoGuardado,
} from './modo-color';

// Modo de color (013, US6; research R-05): se lee y se guarda en localStorage dentro de try/catch y
// se aplica con data-coreui-theme en <html>. Sin elección ("sistema"), no hay atributo.

const html = () => document.documentElement;

describe('modo-color', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    html().removeAttribute('data-coreui-theme');
  });

  it.each(['claro', 'oscuro', 'sistema'] as const)('lee el modo guardado "%s"', (modo) => {
    localStorage.setItem(CLAVE_MODO, modo);

    expect(leerModoGuardado()).toBe(modo);
  });

  it.each([null, 'azul', '', 'DARK'])('un valor ausente o ajeno (%p) es "sistema"', (valor) => {
    if (valor !== null) {
      localStorage.setItem(CLAVE_MODO, valor);
    }

    expect(leerModoGuardado()).toBe('sistema');
  });

  it('guardarModo escribe la elección y "sistema" la borra', () => {
    guardarModo('oscuro');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('oscuro');

    guardarModo('sistema');
    expect(localStorage.getItem(CLAVE_MODO)).toBeNull();
  });

  it('la clave es licencias-modo-color', () => {
    expect(CLAVE_MODO).toBe('licencias-modo-color');
  });

  it.each([
    ['claro', 'light'],
    ['oscuro', 'dark'],
  ] as const)('aplicarModo("%s") pone data-coreui-theme="%s"', (modo, atributo) => {
    aplicarModo(modo);

    expect(html()).toHaveAttribute('data-coreui-theme', atributo);
  });

  it('aplicarModo("sistema") quita el atributo', () => {
    html().setAttribute('data-coreui-theme', 'dark');

    aplicarModo('sistema');

    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });

  it('aplicarModoGuardado aplica la elección guardada', () => {
    localStorage.setItem(CLAVE_MODO, 'oscuro');

    aplicarModoGuardado();

    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
  });

  it('si localStorage lanza un error al leer y al escribir, nada falla y se usa "sistema"', () => {
    const lanzar = () => {
      throw new Error('bloqueado');
    };
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(lanzar);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(lanzar);
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(lanzar);

    expect(leerModoGuardado()).toBe('sistema');
    expect(() => {
      guardarModo('oscuro');
    }).not.toThrow();
    expect(() => {
      guardarModo('sistema');
    }).not.toThrow();
    expect(() => {
      aplicarModoGuardado();
    }).not.toThrow();
    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });
});
