import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatearFechaHora } from '../../componentes/TablaEventos';
import { reiniciarSesion } from '../../sesion/almacen-sesion';
import { json, problema, sesionDePrueba, simularApi } from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';

const PERFIL = {
  nombreCompleto: 'Persona de Prueba',
  correo: 'persona@ejemplo.pe',
  celularEnmascarado: '9*****321',
  roles: ['MESA_PARTES', 'CAJA'],
  ultimoIngreso: '2026-11-23T14:00:00Z',
  sesionesAbiertas: 1,
};

const conSesion = (perfil: unknown, roles: string[] = ['MESA_PARTES', 'CAJA']) => ({
  'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
  'GET /perfil': () => json(perfil),
});

/** Valor del `<dd>` que sigue al `<dt>` con ese texto. */
const dato = (termino: string) =>
  screen.getByText(termino, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Página Mi perfil (011, HU2)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra los datos propios con el celular enmascarado y los nombres de los roles', async () => {
    simularApi(conSesion(PERFIL));
    montarEn('/perfil');

    expect(await screen.findByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
    await screen.findByText('persona@ejemplo.pe');
    expect(dato('Nombre completo')).toBe('Persona de Prueba');
    expect(dato('Correo')).toBe('persona@ejemplo.pe');
    expect(dato('Celular')).toBe('9*****321');
    expect(dato('Roles')).toBe('Mesa de partes, Caja');
    expect(dato('Último ingreso')).toBe(formatearFechaHora('2026-11-23T14:00:00Z'));
    expect(dato('Sesiones abiertas')).toBe('1 sesión abierta');
  });

  it('usa el plural con varias sesiones abiertas', async () => {
    simularApi(conSesion({ ...PERFIL, sesionesAbiertas: 3 }));
    montarEn('/perfil');

    expect(await screen.findByText('3 sesiones abiertas')).toBeInTheDocument();
  });

  it('sin último ingreso muestra "Sin registro" y sin roles "Sin roles"', async () => {
    simularApi(conSesion({ ...PERFIL, ultimoIngreso: null, roles: [] }, []));
    montarEn('/perfil');

    await screen.findByText('persona@ejemplo.pe');
    expect(dato('Último ingreso')).toBe('Sin registro');
    expect(dato('Roles')).toBe('Sin roles');
  });

  it('con state.sinRol avisa que todavía no tiene rol', async () => {
    simularApi(conSesion({ ...PERFIL, roles: [] }, []));
    montarEn({ pathname: '/perfil', state: { sinRol: true } });

    await screen.findByText('persona@ejemplo.pe');
    expect(
      screen.getByText('Todavía no tiene un rol asignado. Consulte con el administrador.'),
    ).toHaveAttribute('role', 'status');
  });

  it('"Su clave se cambió" aparece una sola vez (lo muestra el aviso común)', async () => {
    simularApi(conSesion(PERFIL));
    montarEn({ pathname: '/perfil', state: { aviso: 'Su clave se cambió' } });

    await screen.findByText('persona@ejemplo.pe');
    expect(screen.getAllByText('Su clave se cambió')).toHaveLength(1);
  });

  it('el enlace "Cambiar mi clave" lleva a /cambiar-clave', async () => {
    simularApi(conSesion(PERFIL));
    montarEn('/perfil');

    const principal = await screen.findByRole('main');
    expect(
      await within(principal).findByRole('link', { name: 'Cambiar mi clave' }),
    ).toHaveAttribute('href', '/cambiar-clave');
  });

  it('ante un error lo dice y "Reintentar" vuelve a pedir el perfil', async () => {
    let intentos = 0;
    const llamadas = simularApi({
      'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['CAJA'] })),
      'GET /perfil': () => {
        intentos += 1;
        return intentos === 1 ? problema(503, 'servicio-no-disponible') : json(PERFIL);
      },
    });
    montarEn('/perfil');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar su perfil. Inténtelo de nuevo.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('persona@ejemplo.pe')).toBeInTheDocument();
    expect(llamadas.filter((l) => l.clave === 'GET /perfil')).toHaveLength(2);
  });

  it('sin sesión lleva a /ingresar sin pedir el perfil', async () => {
    const llamadas = simularApi({ 'POST /auth/renovar': () => problema(401, 'no-autenticado') });
    montarEn('/perfil');

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave === 'GET /perfil')).toBe(false);
  });
});
