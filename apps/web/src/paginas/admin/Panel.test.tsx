import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  json,
  problema,
  sesionDePrueba,
  simularApi,
  type Manejador,
} from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

// Datos FICTICIOS con la forma del contrato (PanelAdministrador de la 009).
const PANEL = {
  usuarios: { activos: 5, inactivos: 2 },
  porRol: { MESA_PARTES: 1, EVALUADOR: 2, INSPECTOR: 1, CAJA: 1, JEFATURA: 1, ADMINISTRADOR: 1 },
  bloqueos: { cuentas: 1, origenes: 0 },
  sesionesAbiertas: 3,
  ingresosFallidos: { hoy: 4, ultimos7Dias: 9 },
  ultimosEventos: [
    {
      id: '9',
      ocurridoEn: '2026-11-23T20:05:00Z',
      accion: 'CUENTA_BLOQUEADA',
      textoAccion: 'Cuenta bloqueada por intentos',
      actor: null,
      afectado: { id: '00000000-0000-4000-8000-0000000000bb', nombre: 'Beto Caja' },
      objeto: null,
      resultado: 'RECHAZADO',
    },
  ],
};

const montar = (manejadores: Record<string, Manejador>, roles = ['ADMINISTRADOR']) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    'GET /catalogo/recetas': () => json([]),
    ...manejadores,
  });
  montarEn('/admin');
  return { llamadas, usuario: userEvent.setup() };
};

describe('Panel del administrador (009)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra las tarjetas, los últimos eventos y los accesos directos', async () => {
    montar({ 'GET /admin/panel': () => json(PANEL) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panel del administrador' }),
    ).toBeInTheDocument();
    const usuarios = within(await screen.findByRole('region', { name: 'Usuarios' }));
    expect(usuarios.getByText('5 activos')).toBeInTheDocument();
    expect(usuarios.getByText('2 inactivos')).toBeInTheDocument();
    const roles = within(screen.getByRole('region', { name: 'Usuarios por rol' }));
    expect(roles.getByText('Evaluador').nextSibling).toHaveTextContent('2');
    expect(
      within(screen.getByRole('region', { name: 'Cuentas bloqueadas' })).getByText('1'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Ingresos fallidos' })).getByText('4 hoy'),
    ).toBeInTheDocument();
    expect(screen.getByText('9 en los últimos 7 días')).toBeInTheDocument();
    const eventos = within(screen.getByRole('region', { name: 'Tabla de los últimos eventos' }));
    expect(eventos.getByText('Cuenta bloqueada por intentos')).toBeInTheDocument();
    expect(eventos.getByText('Sin sesión')).toBeInTheDocument();
    const accesos = within(screen.getByRole('navigation', { name: 'Accesos directos' }));
    expect(accesos.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
    expect(accesos.getByRole('link', { name: 'Auditoría' })).toHaveAttribute(
      'href',
      '/admin/auditoria',
    );
    expect(accesos.getByRole('link', { name: 'Catálogo' })).toHaveAttribute(
      'href',
      '/admin/catalogo',
    );
    expect(accesos.getByRole('link', { name: 'Feriados' })).toHaveAttribute(
      'href',
      '/admin/feriados',
    );
  });

  it('si el servicio de bloqueos no responde, lo dice en vez de mostrar 0', async () => {
    montar({ 'GET /admin/panel': () => json({ ...PANEL, bloqueos: null }) });

    const tarjeta = within(await screen.findByRole('region', { name: 'Cuentas bloqueadas' }));
    expect(tarjeta.getByText(/No disponible/)).toBeInTheDocument();
    expect(tarjeta.queryByText('0')).not.toBeInTheDocument();
  });

  it('"Actualizar" vuelve a pedir el panel', async () => {
    let pedidos = 0;
    const { usuario } = montar({
      'GET /admin/panel': () => {
        pedidos += 1;
        return json(PANEL);
      },
    });
    await screen.findByRole('region', { name: 'Usuarios' });

    await usuario.click(screen.getByRole('button', { name: 'Actualizar' }));

    await screen.findByRole('region', { name: 'Usuarios' });
    expect(pedidos).toBe(2);
  });

  it('un error permite reintentar', async () => {
    let fallar = true;
    const { usuario } = montar({
      'GET /admin/panel': () => (fallar ? problema(500, 'error') : json(PANEL)),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el panel');

    fallar = false;
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('region', { name: 'Usuarios' })).toBeInTheDocument();
  });

  it('otro rol no entra al panel', async () => {
    montar({ 'GET /admin/panel': () => json(PANEL) }, ['CAJA']);

    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene permiso');
    expect(screen.queryByText('Panel del administrador')).not.toBeInTheDocument();
  });
});
