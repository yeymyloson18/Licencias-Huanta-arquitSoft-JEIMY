import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, sesionDePrueba, simularApi } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';
import { obtenerSesion, reiniciarSesion } from '../sesion/almacen-sesion';
import { inicioDe } from '../sesion/inicio';

const PERFIL = {
  nombreCompleto: 'Persona de Prueba',
  correo: 'persona@ejemplo.pe',
  celularEnmascarado: '9*****321',
  roles: ['CAJA'],
  ultimoIngreso: null,
  sesionesAbiertas: 1,
};

const conSesion = (roles: string[]) => ({
  'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
  'GET /catalogo/recetas': () => json([]),
  'GET /perfil': () => json({ ...PERFIL, roles }),
  'POST /auth/cerrar-sesion': () => new Response(null, { status: 204 }),
});

// 013 (R-11): el menú del personal vive ahora en el área de administración (DisenoPersonal), así que
// las opciones por rol se comprueban montando una pantalla del personal (/perfil, que admite cualquier
// rol y también ninguno) en lugar de la portada. El <nav> "Menú del personal" es el mismo.
const PANTALLA_PERSONAL = '/perfil';

// 013 (R-11): "Mi perfil" y "Cerrar sesión" pasaron del <nav> al desplegable del nombre en la barra.
const abrirDesplegable = async () => {
  const boton = screen.getByRole('button', { name: 'Persona de Prueba' });
  await userEvent.setup().click(boton);
  return boton.closest('.dropdown') as HTMLElement;
};

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
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
    // 013 (R-11): el nombre está en el botón del desplegable de la barra, no dentro del <nav>.
    expect(screen.getByRole('button', { name: 'Persona de Prueba' })).toBeInTheDocument();
  });

  it('el administrador ve "Auditoría" de seguridad (009)', async () => {
    simularApi(conSesion(['ADMINISTRADOR']));
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'href',
      '/admin/auditoria',
    );
  });

  it('caja no ve "Usuarios"', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('el administrador ve "Catálogo" (003)', async () => {
    simularApi(conSesion(['ADMINISTRADOR']));
    montarEn(PANTALLA_PERSONAL);

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
      montarEn(PANTALLA_PERSONAL);

      const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

      expect(within(menu).queryByRole('link', { name: 'Catálogo' })).not.toBeInTheDocument();
    },
  );

  it.each(['MESA_PARTES', 'EVALUADOR', 'JEFATURA'])('%s ve "Expedientes" (004)', async (rol) => {
    simularApi(conSesion([rol]));
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Expedientes' })).toHaveAttribute(
      'href',
      '/personal/expedientes',
    );
  });

  it.each(['CAJA', 'INSPECTOR', 'ADMINISTRADOR'])('%s no ve "Expedientes" (004)', async (rol) => {
    simularApi(conSesion([rol]));
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).queryByRole('link', { name: 'Expedientes' })).not.toBeInTheDocument();
  });

  it('caja ve "Caja"; el evaluador no (005)', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Caja' })).toHaveAttribute(
      'href',
      '/personal/caja',
    );
  });

  it.each([['INSPECTOR'], ['JEFATURA']])('%s ve "Inspecciones" (006)', async (rol) => {
    simularApi(conSesion([rol]));
    montarEn(PANTALLA_PERSONAL);

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
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: etiqueta })).toHaveAttribute('href', ruta);
  });

  it('solo jefatura ve "Tablero" (007)', async () => {
    simularApi(conSesion(['JEFATURA']));
    montarEn(PANTALLA_PERSONAL);
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
      montarEn(PANTALLA_PERSONAL);
      const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });
      expect(within(menu).queryByRole('link', { name: 'Tablero' })).not.toBeInTheDocument();
    },
  );

  it('jefatura ve "Auditoría" (005)', async () => {
    simularApi(conSesion(['JEFATURA']));
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'href',
      '/personal/auditoria',
    );
  });

  it('el evaluador no ve "Caja" (005)', async () => {
    simularApi(conSesion(['EVALUADOR']));
    montarEn(PANTALLA_PERSONAL);

    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(within(menu).queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
  });

  it('mesa de partes ve "Registrar solicitud" (004)', async () => {
    simularApi(conSesion(['MESA_PARTES']));
    montarEn(PANTALLA_PERSONAL);

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
      montarEn(PANTALLA_PERSONAL);

      const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

      expect(
        within(menu).queryByRole('link', { name: 'Registrar solicitud' }),
      ).not.toBeInTheDocument();
    },
  );

  it('"Cerrar sesión" llama a la API y vuelve a /ingresar', async () => {
    const llamadas = simularApi(conSesion(['CAJA']));
    montarEn(PANTALLA_PERSONAL);
    const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });

    expect(menu).toBeInTheDocument();
    const desplegable = await abrirDesplegable();
    await userEvent
      .setup()
      .click(within(desplegable).getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave === 'POST /auth/cerrar-sesion')).toBe(true);
    expect(obtenerSesion()).toBeNull();
  });

  it.each([
    [['ADMINISTRADOR']],
    [['MESA_PARTES']],
    [['EVALUADOR']],
    [['INSPECTOR']],
    [['CAJA']],
    [['JEFATURA']],
    [[]],
  ])('con roles %j muestra "Mi perfil" junto al nombre (011)', async (roles) => {
    simularApi(conSesion(roles));
    montarEn(PANTALLA_PERSONAL);

    await screen.findByRole('navigation', { name: 'Menú del personal' });
    // 013 (R-11): "junto al nombre" es ahora dentro del desplegable que abre el botón con el nombre.
    const desplegable = await abrirDesplegable();
    const perfil = within(desplegable).getByRole('link', { name: 'Mi perfil' });

    expect(perfil).toHaveAttribute('href', '/perfil');
    expect(
      within(desplegable).getByRole('button', { name: 'Persona de Prueba' }),
    ).toBeInTheDocument();
  });

  // 013 (R-11): la prueba anterior ahora monta /perfil; que "Mi perfil" no lleve aria-current fuera
  // de su pantalla se comprueba aquí, en otra pantalla del personal.
  it('fuera de /perfil, "Mi perfil" no lleva aria-current (011)', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn('/personal/caja');

    await screen.findByRole('navigation', { name: 'Menú del personal' });
    const desplegable = await abrirDesplegable();

    expect(within(desplegable).getByRole('link', { name: 'Mi perfil' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('en /perfil, "Mi perfil" lleva aria-current="page" (011)', async () => {
    simularApi({ ...conSesion(['CAJA']), 'GET /perfil': () => json(PERFIL) });
    montarEn('/perfil');

    await screen.findByRole('navigation', { name: 'Menú del personal' });
    const desplegable = await abrirDesplegable();

    expect(within(desplegable).getByRole('link', { name: 'Mi perfil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sin sesión no hay "Mi perfil" (el administrado no tiene cuenta, 011)', async () => {
    simularApi({
      'POST /auth/renovar': () => problema(401, 'no-autenticado'),
      'GET /catalogo/recetas': () => json([]),
    });
    montarEn(PANTALLA_PERSONAL);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument();
  });

  it.each<[string[], string, string]>([
    [['ADMINISTRADOR'], 'Panel', '/admin'],
    [['MESA_PARTES'], 'Expedientes', '/personal/expedientes'],
    [['EVALUADOR'], 'Expedientes', '/personal/expedientes'],
    [['CAJA'], 'Caja', '/personal/caja'],
    [['INSPECTOR'], 'Inspecciones', '/personal/inspecciones'],
    [['JEFATURA'], 'Tablero', '/personal/tablero'],
    [['INSPECTOR', 'CAJA'], 'Caja', '/personal/caja'],
    [[], 'Mi perfil', '/perfil'],
  ])(
    'con roles %j no hay "Inicio"; su pantalla es la opción "%s" (%s) y nada va a "/" (011, FR-020)',
    async (roles, opcion, pantalla) => {
      simularApi(conSesion(roles));
      montarEn(PANTALLA_PERSONAL);

      const menu = await screen.findByRole('navigation', { name: 'Menú del personal' });
      // 013 (R-11): las opciones de trabajo están en el <nav>; "Mi perfil", en el desplegable.
      const desplegable = await abrirDesplegable();
      const enlaces = [
        ...within(menu).queryAllByRole('link'),
        ...within(desplegable).getAllByRole('link'),
      ];

      expect(enlaces.map((enlace) => enlace.textContent)).not.toContain('Inicio');
      expect(enlaces.find((enlace) => enlace.textContent === opcion)).toHaveAttribute(
        'href',
        pantalla,
      );
      // Es la misma pantalla a la que llega al ingresar.
      expect(inicioDe(roles)).toBe(pantalla);
      const destinos = enlaces.map((enlace) => enlace.getAttribute('href'));
      expect(destinos).not.toContain('/');
    },
  );

  it('con sesión, el portal público sigue abierto sin redirigir (011, FR-020)', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn('/');

    await screen.findByRole('navigation', { name: 'Menú del personal' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/licencia/i);
    expect(screen.queryByRole('heading', { level: 1, name: 'Caja' })).not.toBeInTheDocument();
  });
});
