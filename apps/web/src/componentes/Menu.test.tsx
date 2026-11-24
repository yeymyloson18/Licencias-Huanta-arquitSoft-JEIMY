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

  it('el administrador ve "Auditoría" de seguridad (009)', async () => {
    simularApi(conSesion(['ADMINISTRADOR']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'href',
      '/admin/auditoria',
    );
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

  it.each(['MESA_PARTES', 'EVALUADOR', 'JEFATURA'])('%s ve "Expedientes" (004)', async (rol) => {
    simularApi(conSesion([rol]));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Expedientes' })).toHaveAttribute(
      'href',
      '/personal/expedientes',
    );
  });

  it.each(['CAJA', 'INSPECTOR', 'ADMINISTRADOR'])('%s no ve "Expedientes" (004)', async (rol) => {
    simularApi(conSesion([rol]));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).queryByRole('link', { name: 'Expedientes' })).not.toBeInTheDocument();
  });

  it('caja ve "Caja"; el evaluador no (005)', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Caja' })).toHaveAttribute(
      'href',
      '/personal/caja',
    );
  });

  it.each([['INSPECTOR'], ['JEFATURA']])('%s ve "Inspecciones" (006)', async (rol) => {
    simularApi(conSesion([rol]));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Inspecciones' })).toHaveAttribute(
      'href',
      '/personal/inspecciones',
    );
  });

  it.each([
    ['ADMINISTRADOR', 'Feriados', '/admin/feriados'],
    ['JEFATURA', 'Alertas', '/personal/alertas'],
  ])('%s ve "%s" (006)', async (rol, etiqueta, ruta) => {
    simularApi(conSesion([rol]));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: etiqueta })).toHaveAttribute('href', ruta);
  });

  it('solo jefatura ve "Tablero" (007)', async () => {
    simularApi(conSesion(['JEFATURA']));
    montarEn('/');
    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });
    expect(within(menu).getByRole('link', { name: 'Tablero' })).toHaveAttribute(
      'href',
      '/personal/tablero',
    );
  });

  it.each(['MESA_PARTES', 'EVALUADOR', 'CAJA', 'ADMINISTRADOR'])(
    '%s no ve "Tablero" (007)',
    async (rol) => {
      simularApi(conSesion([rol]));
      montarEn('/');
      const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });
      expect(within(menu).queryByRole('link', { name: 'Tablero' })).not.toBeInTheDocument();
    },
  );

  it('jefatura ve "Auditoría" (005)', async () => {
    simularApi(conSesion(['JEFATURA']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'href',
      '/personal/auditoria',
    );
  });

  it('el evaluador no ve "Caja" (005)', async () => {
    simularApi(conSesion(['EVALUADOR']));
    montarEn('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
  });

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
