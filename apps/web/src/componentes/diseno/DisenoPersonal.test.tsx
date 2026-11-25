import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, sesionDePrueba, simularApi } from '../../pruebas/api-simulada';
import { simularMedios } from '../../pruebas/medios';
import { montarEn } from '../../pruebas/montar';
import { obtenerSesion, reiniciarSesion } from '../../sesion/almacen-sesion';

// Área de administración del personal (013, US1; contracts/portal-diseno.md): menú lateral con las
// opciones del rol, barra con el desplegable del usuario, migas de pan y pie.

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
  'GET /perfil': () => json({ ...PERFIL, roles }),
  'POST /auth/cerrar-sesion': () => new Response(null, { status: 204 }),
});

const menuLateral = () => screen.findByRole('navigation', { name: 'Menú del personal' });

describe('DisenoPersonal (US1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('el menú lateral tiene las opciones del rol, con aria-current en la actual', async () => {
    simularApi(conSesion(['JEFATURA']));
    montarEn('/personal/alertas');

    const menu = await menuLateral();
    const enlaces = within(menu).getAllByRole('link');

    expect(enlaces.map((enlace) => enlace.textContent)).toEqual([
      'Expedientes',
      'Auditoría',
      'Inspecciones',
      'Alertas',
      'Tablero',
    ]);
    expect(within(menu).getByRole('link', { name: 'Alertas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menu).getByRole('link', { name: 'Tablero' })).not.toHaveAttribute('aria-current');
  });

  it('"Panel" solo está activo en /admin, no en las pantallas de adentro', async () => {
    simularApi(conSesion(['ADMINISTRADOR']));
    montarEn('/admin/feriados');

    const menu = await menuLateral();

    expect(within(menu).getByRole('link', { name: 'Panel' })).not.toHaveAttribute('aria-current');
    expect(within(menu).getByRole('link', { name: 'Feriados' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sin roles el menú lateral no tiene opciones de trabajo', async () => {
    simularApi(conSesion([]));
    montarEn('/perfil');

    const menu = await menuLateral();

    expect(within(menu).queryAllByRole('link')).toEqual([]);
  });

  it('el menú lateral no enlaza al portal público (011, FR-020)', async () => {
    simularApi(conSesion(['ADMINISTRADOR']));
    montarEn('/perfil');

    const menu = await menuLateral();

    expect(
      within(menu)
        .getAllByRole('link')
        .map((enlace) => enlace.getAttribute('href')),
    ).not.toContain('/');
  });

  it('el botón del menú lo muestra y lo oculta; Escape o elegir una opción lo cierran', async () => {
    const usuario = userEvent.setup();
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');
    await menuLateral();

    const boton = screen.getByRole('button', { name: 'Mostrar menú' });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(boton).toHaveAttribute('aria-controls');

    await usuario.click(boton);
    expect(screen.getByRole('button', { name: 'Ocultar menú' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await usuario.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Mostrar menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await usuario.click(screen.getByRole('button', { name: 'Mostrar menú' }));
    await usuario.click(within(await menuLateral()).getByRole('link', { name: 'Caja' }));
    expect(await screen.findByRole('button', { name: 'Mostrar menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('en el celular, el menú cerrado no se alcanza con el teclado (inert)', async () => {
    simularMedios({ celular: true });
    const usuario = userEvent.setup();
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');

    const menu = await menuLateral();
    const lateral = menu.closest('.sidebar');
    expect(lateral).toHaveAttribute('inert');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar menú' }));
    expect(lateral).not.toHaveAttribute('inert');
    expect(lateral).toHaveClass('show');
  });

  // T043 (b): a 360 px el menú abierto tapa el botón de la barra; se cierra desde adentro.
  it('en el celular, al abrir el menú el foco va a "Cerrar menú", que lo cierra y vuelve al botón', async () => {
    simularMedios({ celular: true });
    const usuario = userEvent.setup();
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');
    const lateral = (await menuLateral()).closest('.sidebar');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar menú' }));
    const cerrar = screen.getByRole('button', { name: 'Cerrar menú' });
    expect(cerrar).toHaveFocus();

    await usuario.click(cerrar);
    expect(lateral).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Mostrar menú' })).toHaveFocus();
  });

  it('en escritorio, el menú se puede plegar', async () => {
    const usuario = userEvent.setup();
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');

    const lateral = (await menuLateral()).closest('.sidebar');
    await usuario.click(screen.getByRole('button', { name: 'Plegar menú' }));

    expect(lateral).toHaveClass('sidebar-narrow');
    expect(screen.getByRole('button', { name: 'Desplegar menú' })).toBeInTheDocument();
  });

  it('el desplegable del nombre tiene "Mi perfil" y "Cerrar sesión"', async () => {
    const usuario = userEvent.setup();
    const llamadas = simularApi(conSesion(['CAJA']));
    montarEn('/perfil');
    await menuLateral();

    await usuario.click(screen.getByRole('button', { name: 'Persona de Prueba' }));
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil');

    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(llamadas.some((llamada) => llamada.clave === 'POST /auth/cerrar-sesion')).toBe(true);
    expect(obtenerSesion()).toBeNull();
  });

  it('el desplegable se usa con el teclado (análisis E2)', async () => {
    const usuario = userEvent.setup();
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');
    await menuLateral();
    const boton = screen.getByRole('button', { name: 'Persona de Prueba' });

    boton.focus();
    await usuario.keyboard('{Enter}');
    expect(boton).toHaveAttribute('aria-expanded', 'true');

    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toHaveFocus();
    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toHaveFocus();

    await usuario.keyboard('{Escape}');
    await waitFor(() => {
      expect(boton).toHaveAttribute('aria-expanded', 'false');
    });
    expect(boton).toHaveFocus();

    await usuario.keyboard(' ');
    expect(boton).toHaveAttribute('aria-expanded', 'true');
  });

  it('las migas de pan marcan la pantalla actual', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');

    const migas = await screen.findByRole('navigation', { name: 'Migas de pan' });

    expect(within(migas).getByText('Mi perfil')).toHaveAttribute('aria-current', 'page');
  });

  it('el pie dice la Municipalidad y el sistema', async () => {
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');
    await menuLateral();

    expect(screen.getByRole('contentinfo')).toHaveTextContent('Municipalidad Provincial de Huanta');
  });

  it('sin sesión, una pantalla del personal lleva a /ingresar sin menú lateral', async () => {
    simularApi({ 'POST /auth/renovar': () => problema(401, 'no-autenticado') });
    montarEn('/perfil');

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menú del personal' })).not.toBeInTheDocument();
  });

  // 013 (FR-019 corregido): el botón de modo también está en la barra del personal.
  it('la barra tiene el botón de modo, que respeta la elección guardada', async () => {
    simularMedios({ oscuro: true });
    localStorage.setItem('licencias-modo-color', 'claro');
    const usuario = userEvent.setup();
    simularApi(conSesion(['CAJA']));
    montarEn('/perfil');
    await menuLateral();

    await usuario.click(screen.getByRole('button', { name: 'Cambiar a modo oscuro' }));

    expect(document.documentElement).toHaveAttribute('data-coreui-theme', 'dark');
    expect(localStorage.getItem('licencias-modo-color')).toBe('oscuro');
    localStorage.clear();
    document.documentElement.removeAttribute('data-coreui-theme');
  });
});
