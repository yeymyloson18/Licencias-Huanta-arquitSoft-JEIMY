import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BORRADOR_VACIO, ProveedorTramite, useTramite } from './ContextoTramite';

const IDENTIDAD = {
  tipoDocumento: 'DNI' as const,
  numeroDocumento: '40000001',
  fechaEmision: '2020-01-15',
  ruc: '10400000011',
  celular: '987000001',
};

const envoltorio = ({ children }: { children: ReactNode }) => (
  <ProveedorTramite>{children}</ProveedorTramite>
);

describe('ContextoTramite', () => {
  it('confirma el permiso con la identidad recordada y su vencimiento', () => {
    const { result } = renderHook(() => useTramite(), { wrapper: envoltorio });

    act(() => {
      result.current.recordarIdentidad(IDENTIDAD);
    });
    act(() => {
      result.current.confirmar('token-1', 900);
    });

    expect(result.current.permiso?.token).toBe('token-1');
    expect(result.current.permiso?.identidad).toEqual(IDENTIDAD);
    expect(result.current.permiso?.venceEn.getTime()).toBeGreaterThan(Date.now() + 890_000);
  });

  it('sin identidad recordada no confirma nada', () => {
    const { result } = renderHook(() => useTramite(), { wrapper: envoltorio });

    act(() => {
      result.current.confirmar('token-1', 900);
    });

    expect(result.current.permiso).toBeNull();
  });

  it('al olvidar el permiso conserva lo escrito y la identidad, pero no los documentos', () => {
    const { result } = renderHook(() => useTramite(), { wrapper: envoltorio });
    act(() => {
      result.current.recordarIdentidad(IDENTIDAD);
    });
    act(() => {
      result.current.confirmar('token-1', 900);
      result.current.guardarBorrador({ ...BORRADOR_VACIO, giro: 'Bodega' });
      result.current.guardarDocumento(11, { documentoId: 'doc-1', nombre: 'a.pdf' });
    });
    const clave = result.current.claveIdempotencia;

    act(() => {
      result.current.olvidarPermiso();
    });

    expect(result.current.permiso).toBeNull();
    expect(result.current.identidad).toEqual(IDENTIDAD);
    expect(result.current.borrador.giro).toBe('Bodega');
    expect(result.current.documentos).toEqual({});
    expect(result.current.claveIdempotencia).toBe(clave);
  });

  it('un permiso nuevo cambia la clave de idempotencia; quitar un documento lo borra', () => {
    const { result } = renderHook(() => useTramite(), { wrapper: envoltorio });
    act(() => {
      result.current.recordarIdentidad(IDENTIDAD);
    });
    act(() => {
      result.current.confirmar('token-1', 900);
    });
    const primera = result.current.claveIdempotencia;
    act(() => {
      result.current.guardarDocumento(11, { documentoId: 'doc-1', nombre: 'a.pdf' });
    });
    act(() => {
      result.current.guardarDocumento(11, null);
    });
    expect(result.current.documentos).toEqual({});

    act(() => {
      result.current.confirmar('token-2', 900);
    });

    expect(result.current.claveIdempotencia).not.toBe(primera);
  });

  it('al terminar borra todo', () => {
    const { result } = renderHook(() => useTramite(), { wrapper: envoltorio });
    act(() => {
      result.current.recordarIdentidad(IDENTIDAD);
      result.current.guardarBorrador({ ...BORRADOR_VACIO, giro: 'Bodega' });
    });

    act(() => {
      result.current.terminar();
    });

    expect(result.current.identidad).toBeNull();
    expect(result.current.borrador).toEqual(BORRADOR_VACIO);
  });

  it('no usa el almacenamiento del navegador', () => {
    const guardar = jest.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useTramite(), { wrapper: envoltorio });

    act(() => {
      result.current.recordarIdentidad(IDENTIDAD);
    });
    act(() => {
      result.current.confirmar('token-1', 900);
    });

    expect(guardar).not.toHaveBeenCalled();
  });

  it('fuera del proveedor avisa del error', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useTramite())).toThrow(/ProveedorTramite/);
  });
});
