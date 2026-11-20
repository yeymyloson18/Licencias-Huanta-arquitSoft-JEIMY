import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, sesionDePrueba, simularApi } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';
import { obtenerSesion, reiniciarSesion } from '../sesion/almacen-sesion';

const conSesion = (roles: string[]) => ({
  'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
  'GET /catalogo/recetas': () => json([]),
  'POST /auth/cerrar-sesion': () => new Response(null, { status: 204 }),
});

describe('Menú del personal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('sin sesión no muestra opciones privadas', async () => {
    simularApi({
      'POST /auth/renovar': () => problema(401, 'no-autenticado'),
      'GET /catalogo/recetas': () => json([]),
    });
    montarEn('/');

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('navigation', { name: 'Menú del personal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('el administrador ve "Usuarios"', async () => {
    simularApi(conSesion(['ADMINISTRADOR']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
    expect(within(menu).getByText('Persona de Prueba')).toBeInTheDocument();
  });

  it('caja no ve "Usuarios"', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('el administrador ve "Catálogo" (003)', async () => {
    simularApi(conSesion(['ADMINISTRADOR']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Catálogo' })).toHaveAttribute(
      'href',
      '/admin/catalogo',
    );
  });

  it.each(['MESA_PARTES', 'EVALUADOR', 'INSPECTOR', 'CAJA', 'JEFATURA'])(
    'el rol %s no ve "Catálogo"',
    async (rol) => {
      simularApi(conSesion([rol]));
      montarEn('/');

      const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

      expect(within(menu).queryByRole('link', { name: 'Catálogo' })).not.toBeInTheDocument();
    },
  );

  it('mesa de partes ve "Registrar solicitud" (004)', async () => {
    simularApi(conSesion(['MESA_PARTES']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Registrar solicitud' })).toHaveAttribute(
      'href',
      '/personal/mesa-partes/nueva',
    );
  });

  it.each(['CAJA', 'EVALUADOR', 'ADMINISTRADOR'])(
    '%s no ve "Registrar solicitud" (004)',
    async (rol) => {
      simularApi(conSesion([rol]));
      montarEn('/');

      const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

      expect(
        within(menu).queryByRole('link', { name: 'Registrar solicitud' }),
      ).not.toBeInTheDocument();
    },
  );

  it('"Cerrar sesión" llama a la API y vuelve a /ingresar', async () => {
    const llamadas = simularApi(conSesion(['CAJA']));
    montarEn('/');
    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    await userEvent.setup().click(within(menu).getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave === 'POST /auth/cerrar-sesion')).toBe(true);
    expect(obtenerSesion()).toBeNull();
  });
});
