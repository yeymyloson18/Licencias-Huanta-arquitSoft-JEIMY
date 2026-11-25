import { screen, within } from '@testing-library/react';
import { json, problema, sesionDePrueba, simularApi } from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

// Portal ligero del ciudadano (013, US2; contracts/portal-diseno.md): barra con la Municipalidad y el
// acceso del personal (o "Ir a mi trabajo" con sesión), contenido a todo el ancho y pie. Sin menú
// lateral.

const sinSesion = {
  'POST /auth/renovar': () => problema(401, 'no-autenticado'),
  'GET /catalogo/recetas': () => json([]),
};

const conSesion = (roles: string[]) => ({
  'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
  'GET /catalogo/recetas': () => json([]),
});

const barra = async () => {
  const marca = await screen.findByRole('link', { name: 'Municipalidad Provincial de Huanta' });
  return marca.closest('.diseno-publico__barra') as HTMLElement;
};

describe('DisenoPublico (US2)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('la barra tiene la Municipalidad con enlace a la portada', async () => {
    simularApi(sinSesion);
    montarEn('/consulta');

    expect(
      within(await barra()).getByRole('link', { name: 'Municipalidad Provincial de Huanta' }),
    ).toHaveAttribute('href', '/');
  });

  it('sin sesión, "Acceso del personal" va a /ingresar', async () => {
    simularApi(sinSesion);
    montarEn('/');

    const acceso = await screen.findByRole('navigation', { name: 'Acceso del personal' });

    expect(acceso.closest('.diseno-publico__barra')).not.toBeNull();
    expect(within(acceso).getByRole('link', { name: 'Acceso del personal' })).toHaveAttribute(
      'href',
      '/ingresar',
    );
    expect(screen.queryByRole('link', { name: 'Ir a mi trabajo' })).not.toBeInTheDocument();
  });

  it.each<[string[], string]>([
    [['CAJA'], '/personal/caja'],
    [['JEFATURA'], '/personal/tablero'],
    [['ADMINISTRADOR'], '/admin'],
    [[], '/perfil'],
  ])(
    'con roles %j, "Ir a mi trabajo" va a %s y no hay "Acceso del personal"',
    async (roles, ruta) => {
      simularApi(conSesion(roles));
      montarEn('/');

      expect(await screen.findByRole('link', { name: 'Ir a mi trabajo' })).toHaveAttribute(
        'href',
        ruta,
      );
      expect(screen.queryByRole('link', { name: 'Acceso del personal' })).not.toBeInTheDocument();
    },
  );

  it('no hay menú lateral del personal, ni con sesión', async () => {
    simularApi(conSesion(['JEFATURA']));
    montarEn('/');

    await screen.findByRole('link', { name: 'Ir a mi trabajo' });
    expect(screen.queryByRole('navigation', { name: 'Menú del personal' })).not.toBeInTheDocument();
  });

  it('el pie dice la Municipalidad y el sistema', async () => {
    simularApi(sinSesion);
    montarEn('/');
    await barra();

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Municipalidad Provincial de Huanta · Sistema de Licencias de Funcionamiento',
    );
  });

  it('/ingresar usa el diseño público, sin "Acceso del personal"', async () => {
    simularApi(sinSesion);
    montarEn('/ingresar');

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    await barra();
    expect(screen.queryByRole('link', { name: 'Acceso del personal' })).not.toBeInTheDocument();
  });

  it('/cambiar-clave usa el diseño público', async () => {
    simularApi({
      'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['CAJA'], debeCambiarClave: true })),
    });
    montarEn('/cambiar-clave');

    await barra();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menú del personal' })).not.toBeInTheDocument();
  });
});
