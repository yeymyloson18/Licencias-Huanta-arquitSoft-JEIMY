import { act, render, screen } from '@testing-library/react';
import {
  type InitialEntry,
  type Location,
  MemoryRouter,
  useLocation,
  useNavigate,
} from 'react-router';
import { AvisoNavegacion } from './AvisoNavegacion';

let ubicacionActual: Location | null = null;
let navegarA: ((ruta: string) => void) | null = null;

function Espia() {
  ubicacionActual = useLocation();
  const navegar = useNavigate();
  navegarA = (ruta) => void navegar(ruta);
  return null;
}

const montar = (entrada: InitialEntry, respaldo?: string) =>
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <AvisoNavegacion respaldo={respaldo} />
      <Espia />
    </MemoryRouter>,
  );

describe('AvisoNavegacion (011: aviso al llegar a la pantalla)', () => {
  afterEach(() => {
    ubicacionActual = null;
    navegarA = null;
  });

  it.each([
    '/admin',
    '/personal/expedientes',
    '/personal/caja',
    '/personal/inspecciones',
    '/personal/tablero',
    '/perfil',
  ])('muestra "Su clave se cambió" al llegar a %s', async (pathname) => {
    montar({ pathname, state: { aviso: 'Su clave se cambió' } });

    expect(await screen.findByRole('status')).toHaveTextContent('Su clave se cambió');
  });

  it('sin aviso no muestra nada', () => {
    montar('/personal/caja');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([42, { texto: 'x' }, ''])('ignora un aviso que no es texto: %j', (aviso) => {
    montar({ pathname: '/personal/caja', state: { aviso } });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('quita el aviso del historial y conserva el resto del estado', async () => {
    montar({ pathname: '/perfil', state: { aviso: 'Su clave se cambió', sinRol: true } });

    expect(await screen.findByRole('status')).toHaveTextContent('Su clave se cambió');
    expect(ubicacionActual?.pathname).toBe('/perfil');
    expect(ubicacionActual?.state).toEqual({ sinRol: true });
  });

  it('al recargar esa misma entrada (ya sin aviso) no lo repite', async () => {
    const { unmount } = montar({
      pathname: '/personal/caja',
      state: { aviso: 'Su clave se cambió' },
    });
    await screen.findByRole('status');
    const estadoDespues: unknown = ubicacionActual?.state;
    unmount();

    montar({ pathname: '/personal/caja', state: estadoDespues });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('desaparece al ir a otra pantalla', async () => {
    montar({ pathname: '/personal/caja', state: { aviso: 'Su clave se cambió' } });
    await screen.findByRole('status');

    act(() => navegarA?.('/perfil'));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sin aviso de navegación muestra el aviso de la sesión (cierre por inactividad)', () => {
    montar('/ingresar', 'Su sesión se cerró por inactividad');

    expect(screen.getByRole('status')).toHaveTextContent('Su sesión se cerró por inactividad');
  });
});
