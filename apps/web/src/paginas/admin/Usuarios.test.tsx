import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  json,
  problema,
  sesionDePrueba,
  simularApi,
  sinContenido,
  usuarioDePrueba,
  type Manejador,
} from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

const ana = usuarioDePrueba({
  id: '00000000-0000-4000-8000-0000000000a1',
  correo: 'ana@ejemplo.pe',
  nombreCompleto: 'Ana Quispe',
  roles: ['CAJA', 'JEFATURA'],
});
const beto = usuarioDePrueba({
  id: '00000000-0000-4000-8000-0000000000b2',
  correo: 'beto@ejemplo.pe',
  nombreCompleto: 'Beto Huamán',
  roles: ['ADMINISTRADOR'],
  activo: false,
});

const pagina = (datos: unknown[]) => json({ pagina: 1, porPagina: 20, total: datos.length, datos });

const base = (otros: Record<string, Manejador> = {}): Record<string, Manejador> => ({
  'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['ADMINISTRADOR'] })),
  'GET /usuarios': () => pagina([ana, beto]),
  ...otros,
});

const abrir = async (manejadores: Record<string, Manejador>) => {
  const llamadas = simularApi(manejadores);
  montarEn('/admin/usuarios');
  await screen.findByRole('heading', { level: 1, name: 'Usuarios' });
  return { llamadas, usuario: userEvent.setup() };
};

describe('Página de gestión de usuarios (historia 5)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('lista nombre, correo, roles y estado', async () => {
    await abrir(base());

    const tarjeta = (await screen.findByText('Ana Quispe')).closest('li');
    expect(tarjeta).not.toBeNull();
    const enTarjeta = within(tarjeta as HTMLElement);
    expect(enTarjeta.getByText('ana@ejemplo.pe')).toBeInTheDocument();
    expect(enTarjeta.getByText('Caja')).toBeInTheDocument();
    expect(enTarjeta.getByText('Jefatura')).toBeInTheDocument();
    expect(enTarjeta.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('cada tarjeta enlaza a la ficha del usuario (009)', async () => {
    await abrir(base());

    expect(await screen.findByRole('link', { name: 'Ver ficha de Ana Quispe' })).toHaveAttribute(
      'href',
      `/admin/usuarios/${ana.id}`,
    );
  });

  it('busca con POST /usuarios/busqueda (el texto no va en la URL)', async () => {
    const { llamadas, usuario } = await abrir(
      base({ 'POST /usuarios/busqueda': () => pagina([ana]) }),
    );

    await usuario.type(screen.getByLabelText('Buscar por nombre o correo'), 'Ana');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(screen.queryByText('Beto Huamán')).not.toBeInTheDocument();
    });
    expect(llamadas.find((l) => l.clave === 'POST /usuarios/busqueda')?.cuerpo).toEqual({
      texto: 'Ana',
      pagina: 1,
      porPagina: 20,
    });
  });

  it('filtra Activos / Inactivos / Todos', async () => {
    const urls: string[] = [];
    const { usuario } = await abrir(
      base({
        'GET /usuarios': (peticion) => {
          urls.push(peticion.url);
          return pagina(peticion.url.includes('activo=false') ? [beto] : [ana, beto]);
        },
      }),
    );

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'Inactivos');

    await waitFor(() => {
      expect(screen.queryByText('Ana Quispe')).not.toBeInTheDocument();
    });
    expect(urls.at(-1)).toMatch(/activo=false/);
  });

  it('da de alta con al menos un rol y recuerda entregar la clave temporal', async () => {
    const { llamadas, usuario } = await abrir(
      base({ 'POST /usuarios': () => json(usuarioDePrueba({ debeCambiarClave: true }), 201) }),
    );

    await usuario.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    expect(
      screen.getByText(
        'Entregue la clave temporal en persona; el usuario deberá cambiarla al ingresar.',
      ),
    ).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Correo'), 'nueva@ejemplo.pe');
    await usuario.type(screen.getByLabelText('Nombre completo'), 'Nueva Persona');
    await usuario.type(screen.getByLabelText('Celular'), '912345678');
    await usuario.type(screen.getByLabelText('Clave temporal'), 'ClaveTemporal2026');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Elija al menos un rol')).toBeInTheDocument();

    await usuario.click(screen.getByRole('checkbox', { name: 'Inspector' }));
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(llamadas.find((l) => l.clave === 'POST /usuarios')?.cuerpo).toEqual({
        correo: 'nueva@ejemplo.pe',
        nombreCompleto: 'Nueva Persona',
        celular: '912345678',
        claveTemporal: 'ClaveTemporal2026',
        roles: ['INSPECTOR'],
      });
    });
  });

  it('muestra el 409 correo-en-uso junto al campo correo', async () => {
    const { usuario } = await abrir(
      base({ 'POST /usuarios': () => problema(409, 'correo-en-uso') }),
    );
    await usuario.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    await usuario.type(screen.getByLabelText('Correo'), 'ana@ejemplo.pe');
    await usuario.type(screen.getByLabelText('Nombre completo'), 'Otra Ana');
    await usuario.type(screen.getByLabelText('Celular'), '912345678');
    await usuario.type(screen.getByLabelText('Clave temporal'), 'ClaveTemporal2026');
    await usuario.click(screen.getByRole('checkbox', { name: 'Caja' }));

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El correo ya está en uso')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('al editar muestra el celular enmascarado y avisa del 409 ultimo-administrador', async () => {
    const { usuario } = await abrir(
      base({
        'PUT /usuarios/00000000-0000-4000-8000-0000000000a1/roles': () =>
          problema(409, 'ultimo-administrador'),
      }),
    );

    const tarjeta = (await screen.findByText('Ana Quispe')).closest('li') as HTMLElement;
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Editar' }));
    expect(screen.getByText('Actual: 9*****321')).toBeInTheDocument();

    await usuario.click(screen.getByRole('checkbox', { name: 'Caja' }));
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Debe existir al menos un administrador activo',
    );
  });

  it('asignar una clave temporal pide confirmación antes de enviarla', async () => {
    const { llamadas, usuario } = await abrir(
      base({
        'POST /usuarios/00000000-0000-4000-8000-0000000000a1/clave-temporal': () => sinContenido(),
      }),
    );
    const tarjeta = (await screen.findByText('Ana Quispe')).closest('li') as HTMLElement;
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Editar' }));

    await usuario.type(screen.getByLabelText('Nueva clave temporal'), 'ClaveTemporal2026');
    await usuario.click(screen.getByRole('button', { name: 'Asignar clave temporal' }));
    expect(llamadas.some((l) => l.clave.endsWith('/clave-temporal'))).toBe(false);
    expect(screen.getByText(/Se cerrarán todas sus sesiones/)).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Clave temporal asignada')).toBeInTheDocument();
    expect(llamadas.find((l) => l.clave.endsWith('/clave-temporal'))?.cuerpo).toEqual({
      claveTemporal: 'ClaveTemporal2026',
    });
  });

  it('muestra los estados cargando, vacío y error con "Reintentar"', async () => {
    let intentos = 0;
    const { usuario } = await abrir(
      base({
        'GET /usuarios': () => {
          intentos += 1;
          return intentos === 1 ? new Response(null, { status: 500 }) : pagina([]);
        },
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la lista de usuarios.',
    );
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('No hay usuarios que coincidan')).toBeInTheDocument();
  });

  it('un usuario sin ADMINISTRADOR ve "No tiene permiso para ver esta página"', async () => {
    simularApi({ 'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['CAJA'] })) });
    montarEn('/admin/usuarios');

    expect(await screen.findByText('No tiene permiso para ver esta página')).toBeInTheDocument();
  });
});
