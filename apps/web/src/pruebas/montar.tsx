import { render } from '@testing-library/react';
import { type InitialEntry, MemoryRouter } from 'react-router';
import { RutasAplicacion } from '../Aplicacion';
import { ProveedorSesion } from '../sesion/ProveedorSesion';

/**
 * Monta el portal completo (mismas rutas que main.tsx) empezando en `ruta`. La ruta puede llevar un
 * estado de navegación, por ejemplo `{ pathname: '/ingresar', state: { volverA: '/perfil' } }`.
 */
export const montarEn = (ruta: InitialEntry) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <RutasAplicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  );
