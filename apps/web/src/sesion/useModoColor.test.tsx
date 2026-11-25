import { act, renderHook } from '@testing-library/react';
import { simularMedios } from '../pruebas/medios';
import { CLAVE_MODO } from './modo-color';
import { useModoColor } from './useModoColor';

// Hook del modo de color (013, US6): elegir aplica y guarda; otra pestaña lo sincroniza.

const html = () => document.documentElement;

describe('useModoColor', () => {
  afterEach(() => {
    localStorage.clear();
    html().removeAttribute('data-coreui-theme');
  });

  it('empieza con el modo guardado', () => {
    localStorage.setItem(CLAVE_MODO, 'claro');

    const { result } = renderHook(() => useModoColor());

    expect(result.current.modo).toBe('claro');
  });

  it('elegir aplica el atributo y lo guarda', () => {
    const { result } = renderHook(() => useModoColor());

    act(() => {
      result.current.elegir('oscuro');
    });

    expect(result.current.modo).toBe('oscuro');
    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('oscuro');
  });

  it('el evento storage de otra pestaña se aplica', () => {
    const { result } = renderHook(() => useModoColor());

    act(() => {
      localStorage.setItem(CLAVE_MODO, 'oscuro');
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_MODO, newValue: 'oscuro' }));
    });

    expect(result.current.modo).toBe('oscuro');
    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');

    act(() => {
      localStorage.removeItem(CLAVE_MODO);
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_MODO, newValue: null }));
    });

    expect(result.current.modo).toBe('sistema');
    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });

  it('en "sistema", un cambio de matchMedia no deja atributo (lo resuelve el CSS)', () => {
    const { result } = renderHook(() => useModoColor());

    act(() => {
      simularMedios({ oscuro: true });
    });

    expect(result.current.modo).toBe('sistema');
    expect(html()).not.toHaveAttribute('data-coreui-theme');
  });
});
