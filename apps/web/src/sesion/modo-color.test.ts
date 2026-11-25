import { simularMedios } from '../pruebas/medios';
import {
  aplicarModo,
  aplicarModoGuardado,
  CLAVE_MODO,
  guardarModo,
  leerModoGuardado,
  modoDelDispositivo,
  modoInicial,
} from './modo-color';

// Modo de color (013, US6; FR-019 y FR-020 corregidos): solo "claro" u "oscuro". Sin elección, el
// valor inicial es el del dispositivo; en cuanto la persona elige, se guarda y se respeta. Se guarda
// en localStorage dentro de try/catch y se aplica con data-coreui-theme en <html>.

const html = () => document.documentElement;

describe('modo-color', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    html().removeAttribute('data-coreui-theme');
  });

  it.each(['claro', 'oscuro'] as const)('lee el modo guardado "%s"', (modo) => {
    localStorage.setItem(CLAVE_MODO, modo);

    expect(leerModoGuardado()).toBe(modo);
  });

  it.each([null, 'sistema', 'azul', '', 'DARK'])(
    'un valor ausente o ajeno (%p) es "sin elección" (null)',
    (valor) => {
      if (valor !== null) {
        localStorage.setItem(CLAVE_MODO, valor);
      }

      expect(leerModoGuardado()).toBeNull();
    },
  );

  it('el modo del dispositivo sigue a prefers-color-scheme', () => {
    expect(modoDelDispositivo()).toBe('claro');

    simularMedios({ oscuro: true });

    expect(modoDelDispositivo()).toBe('oscuro');
  });

  it('sin elección, el modo inicial es el del dispositivo', () => {
    simularMedios({ oscuro: true });

    expect(modoInicial()).toBe('oscuro');
  });

  it('con elección, el modo inicial es el guardado aunque el dispositivo esté en el contrario', () => {
    simularMedios({ oscuro: true });
    localStorage.setItem(CLAVE_MODO, 'claro');

    expect(modoInicial()).toBe('claro');
  });

  it('guardarModo escribe la elección', () => {
    guardarModo('oscuro');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('oscuro');

    guardarModo('claro');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('claro');
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

  it('aplicarModoGuardado aplica la elección guardada', () => {
    localStorage.setItem(CLAVE_MODO, 'oscuro');

    aplicarModoGuardado();

    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
  });

  it('sin elección, aplicarModoGuardado no pone atributo (el CSS sigue al dispositivo)', () => {
    simularMedios({ oscuro: true });

    aplicarModoGuardado();

    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });

  it('si localStorage lanza un error al leer y al escribir, nada falla y vale el dispositivo', () => {
    const lanzar = () => {
      throw new Error('bloqueado');
    };
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(lanzar);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(lanzar);
    simularMedios({ oscuro: true });

    expect(leerModoGuardado()).toBeNull();
    expect(modoInicial()).toBe('oscuro');
    expect(() => {
      guardarModo('claro');
    }).not.toThrow();
    expect(() => {
      aplicarModoGuardado();
    }).not.toThrow();
    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });
});
