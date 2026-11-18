import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RutasAplicacion } from '../Aplicacion';
import { ProveedorSesion } from '../sesion/ProveedorSesion';

/** Monta el portal completo (mismas rutas que main.tsx) empezando en `ruta`. */
export const montarEn = (ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <RutasAplicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  );
