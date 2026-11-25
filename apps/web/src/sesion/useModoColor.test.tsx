import { act, renderHook } from '@testing-library/react';
import { simularMedios } from '../pruebas/medios';
import { CLAVE_MODO } from './modo-color';
import { useModoColor } from './useModoColor';

// Hook del modo de color (013, US6; FR-019 y FR-020 corregidos): dos estados; sin elección vale el
// dispositivo; alternar guarda y aplica; otra pestaña lo sincroniza.

const html = () => document.documentElement;

describe('useModoColor', () => {
  afterEach(() => {
    localStorage.clear();
    html().removeAttribute('data-coreui-theme');
  });

  it('sin elección empieza en el modo del dispositivo, sin atributo', () => {
    simularMedios({ oscuro: true });

    const { result } = renderHook(() => useModoColor());

    expect(result.current.modo).toBe('oscuro');
    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });

  it('con elección empieza en el modo guardado aunque el dispositivo esté en el contrario', () => {
    simularMedios({ oscuro: true });
    localStorage.setItem(CLAVE_MODO, 'claro');

    const { result } = renderHook(() => useModoColor());

    expect(result.current.modo).toBe('claro');
  });

  it('alternar pasa al otro modo, aplica el atributo y lo guarda', () => {
    const { result } = renderHook(() => useModoColor());
    expect(result.current.modo).toBe('claro');

    act(() => {
      result.current.alternar();
    });

    expect(result.current.modo).toBe('oscuro');
    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('oscuro');

    act(() => {
      result.current.alternar();
    });

    expect(result.current.modo).toBe('claro');
    expect(html()).toHaveAttribute('data-coreui-theme', 'light');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('claro');
  });

  it('sin elección, un cambio del dispositivo actualiza el modo sin poner atributo', () => {
    const { result } = renderHook(() => useModoColor());

    act(() => {
      simularMedios({ oscuro: true });
    });

    expect(result.current.modo).toBe('oscuro');
    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });

  it('con elección, un cambio del dispositivo no la cambia', () => {
    const { result } = renderHook(() => useModoColor());
    act(() => {
      result.current.alternar();
    });

    act(() => {
      simularMedios({ oscuro: false });
      simularMedios({ oscuro: true });
      simularMedios({ oscuro: false });
    });

    expect(result.current.modo).toBe('oscuro');
    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
  });

  it('el evento storage de otra pestaña se aplica', () => {
    const { result } = renderHook(() => useModoColor());

    act(() => {
      localStorage.setItem(CLAVE_MODO, 'oscuro');
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_MODO, newValue: 'oscuro' }));
    });

    expect(result.current.modo).toBe('oscuro');
    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
  });
});
