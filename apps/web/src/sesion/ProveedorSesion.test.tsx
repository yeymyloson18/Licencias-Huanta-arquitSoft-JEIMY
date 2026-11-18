import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { json, problema, sesionDePrueba, simularApi } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';
import { listarLicencias } from '../servicios/clienteApi';
import { obtenerSesion, reiniciarSesion } from './almacen-sesion';
import { ProveedorSesion } from './ProveedorSesion';

describe('ProveedorSesion', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('al montar llama a /auth/renovar para recuperar la sesión desde la cookie', async () => {
    const llamadas = simularApi({
      'POST /auth/renovar': () => json(sesionDePrueba()),
      'GET /catalogo/recetas': () => json([]),
    });

    montarEn('/');

    await act(async () => {
      await Promise.resolve();
    });
    // Los efectos de los hijos corren antes: la página puede pedir el catálogo primero.
    expect(llamadas.filter((l) => l.clave === 'POST /auth/renovar')).toHaveLength(1);
    expect(obtenerSesion()?.accessToken).toBe('token-1');
  });

  it('ante un 401 renueva una vez y reintenta la petición con el token nuevo', async () => {
    let renovaciones = 0;
    let catalogos = 0;
    const llamadas = simularApi({
      'POST /auth/renovar': () => {
        renovaciones += 1;
        return json(sesionDePrueba({}, `token-${String(renovaciones)}`));
      },
      'GET /catalogo/recetas': () => {
        catalogos += 1;
        return catalogos === 1 ? problema(401, 'no-autenticado') : json([]);
      },
    });
    // Sin rutas: así ninguna página pide el catálogo por su cuenta.
    render(
      <MemoryRouter>
        <ProveedorSesion>
          <p>contenido</p>
        </ProveedorSesion>
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(obtenerSesion()?.accessToken).toBe('token-1');

    await expect(listarLicencias()).resolves.toEqual([]);

    const catalogo = llamadas.filter((l) => l.clave === 'GET /catalogo/recetas');
    expect(catalogo).toHaveLength(2);
    expect(catalogo[1]?.autorizacion).toBe(`Bearer token-${String(renovaciones)}`);
  });

  it('30 minutos sin actividad cierran la sesión con un aviso', async () => {
    jest.useFakeTimers();
    const llamadas = simularApi({
      'POST /auth/renovar': () => json(sesionDePrueba()),
      'POST /auth/cerrar-sesion': () => new Response(null, { status: 204 }),
      'GET /catalogo/recetas': () => json([]),
    });
    montarEn('/cambiar-clave');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(obtenerSesion()).not.toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 60 * 1000 + 60_000);
    });

    expect(obtenerSesion()).toBeNull();
    expect(llamadas.some((l) => l.clave === 'POST /auth/cerrar-sesion')).toBe(true);
    expect(screen.getByText('Su sesión se cerró por inactividad')).toBeInTheDocument();
  });

  it('nunca guarda el token en localStorage ni en sessionStorage', async () => {
    const guardar = jest.spyOn(Storage.prototype, 'setItem');
    simularApi({
      'POST /auth/renovar': () => json(sesionDePrueba()),
      'GET /catalogo/recetas': () => json([]),
    });

    montarEn('/');
    await act(async () => {
      await Promise.resolve();
    });

    expect(guardar).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });
});
