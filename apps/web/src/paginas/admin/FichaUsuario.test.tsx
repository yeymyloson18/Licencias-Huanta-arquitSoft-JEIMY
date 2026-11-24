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

// Datos FICTICIOS con la forma del contrato (FichaUsuario de la 009).
const ID = '00000000-0000-4000-8000-0000000000bb';
const PROPIO = '00000000-0000-4000-8000-000000000001'; // el de sesionDePrueba
const ADMIN = { id: PROPIO, nombre: 'Persona de Prueba' };
const ficha = (cambios: Record<string, unknown> = {}) => ({
  ...usuarioDePrueba({ id: ID, nombreCompleto: 'Beto Caja', correo: 'beto@ejemplo.pe' }),
  ultimoIngreso: '2026-11-23T14:00:00Z',
  sesionesAbiertas: 2,
  bloqueo: { bloqueada: true, hasta: '2026-11-23T20:15:00Z' },
  historialRoles: [
    {
      rol: 'EVALUADOR',
      asignadoPor: ADMIN,
      asignadoEn: '2026-11-01T15:00:00Z',
      retiradoPor: ADMIN,
      retiradoEn: '2026-11-10T15:00:00Z',
    },
    {
      rol: 'CAJA',
      asignadoPor: ADMIN,
      asignadoEn: '2026-11-10T15:00:00Z',
      retiradoPor: null,
      retiradoEn: null,
    },
  ],
  ultimosEventos: [
    {
      id: '5',
      ocurridoEn: '2026-11-23T20:00:00Z',
      accion: 'CUENTA_BLOQUEADA',
      textoAccion: 'Cuenta bloqueada por intentos',
      actor: null,
      afectado: { id: ID, nombre: 'Beto Caja' },
      objeto: null,
      resultado: 'RECHAZADO',
    },
  ],
  ...cambios,
});

const montar = (manejadores: Record<string, Manejador>, id = ID) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['ADMINISTRADOR'] })),
    'GET /catalogo/recetas': () => json([]),
    [`GET /usuarios/${id}`]: () => json(ficha({ id })),
    ...manejadores,
  });
  montarEn(`/admin/usuarios/${id}`);
  return { llamadas, usuario: userEvent.setup() };
};

describe('Ficha del usuario (009)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra datos con el celular enmascarado, seguridad, historial y últimos eventos', async () => {
    montar({});

    expect(await screen.findByRole('heading', { level: 1, name: 'Beto Caja' })).toBeInTheDocument();
    const datos = within(screen.getByRole('region', { name: 'Datos y seguridad' }));
    expect(datos.getByText('beto@ejemplo.pe')).toBeInTheDocument();
    expect(datos.getByText('9*****321')).toBeInTheDocument();
    expect(datos.getByText(/Bloqueada hasta/)).toBeInTheDocument();
    expect(datos.getByText('2')).toBeInTheDocument();
    const historial = within(screen.getByRole('region', { name: 'Tabla del historial de roles' }));
    expect(historial.getAllByRole('row')).toHaveLength(3);
    expect(historial.getByText('Vigente')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Tabla de sus últimos eventos' })).getByText(
        'Cuenta bloqueada por intentos',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver su auditoría completa' })).toHaveAttribute(
      'href',
      `/admin/auditoria?afectadoId=${ID}`,
    );
  });

  it('"Cerrar todas sus sesiones" pide confirmación y, si se cancela, no hace nada', async () => {
    const { llamadas, usuario } = montar({
      [`POST /usuarios/${ID}/cerrar-sesiones`]: () => json({ sesionesCerradas: 2 }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar todas sus sesiones' }));

    const dialogo = screen.getByRole('alertdialog', { name: 'Cerrar todas sus sesiones' });
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.clave.endsWith('/cerrar-sesiones'))).toBe(false);
  });

  it('al confirmar cierra las sesiones, avisa y recarga la ficha', async () => {
    let pedidosFicha = 0;
    const { usuario } = montar({
      [`GET /usuarios/${ID}`]: () => {
        pedidosFicha += 1;
        return json(ficha());
      },
      [`POST /usuarios/${ID}/cerrar-sesiones`]: () => json({ sesionesCerradas: 2 }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar todas sus sesiones' }));

    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesiones' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se cerraron 2 sesiones.');
    await waitFor(() => {
      expect(pedidosFicha).toBe(2);
    });
  });

  it('desbloquea la cuenta con confirmación', async () => {
    const { llamadas, usuario } = montar({
      [`POST /usuarios/${ID}/desbloquear`]: () => sinContenido(),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Desbloquear cuenta' }));
    await usuario.click(screen.getByRole('button', { name: 'Desbloquear' }));

    expect(await screen.findByRole('status')).toHaveTextContent('La cuenta quedó desbloqueada.');
    expect(llamadas.some((l) => l.clave === `POST /usuarios/${ID}/desbloquear`)).toBe(true);
  });

  it('si el servicio de bloqueos no responde, "Desbloquear" queda deshabilitado con el motivo', async () => {
    montar({ [`GET /usuarios/${ID}`]: () => json(ficha({ bloqueo: null })) });

    const boton = await screen.findByRole('button', { name: 'Desbloquear cuenta' });
    expect(boton).toBeDisabled();
    expect(screen.getByText(/servicio de bloqueos no responde/)).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
  });

  it('en la ficha propia no aparecen "Cerrar todas sus sesiones" ni "Desbloquear cuenta"', async () => {
    montar({}, PROPIO);

    await screen.findByRole('heading', { level: 1 });
    expect(
      screen.queryByRole('button', { name: 'Cerrar todas sus sesiones' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desbloquear cuenta' })).not.toBeInTheDocument();
    expect(screen.getByText(/Es su propia cuenta/)).toBeInTheDocument();
  });

  it('desactivar avisa si quedaría sin administrador activo', async () => {
    const { usuario } = montar({
      [`PATCH /usuarios/${ID}`]: () => problema(409, 'ultimo-administrador'),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar' }));
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Debe quedar al menos un administrador activo.',
    );
  });

  it('reactiva a un usuario inactivo', async () => {
    const { llamadas, usuario } = montar({
      [`GET /usuarios/${ID}`]: () => json(ficha({ activo: false })),
      [`PATCH /usuarios/${ID}`]: () => json(usuarioDePrueba({ id: ID })),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Reactivar' }));
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reactivar' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent('El usuario quedó activo.');
    expect(llamadas.find((l) => l.clave === `PATCH /usuarios/${ID}`)?.cuerpo).toEqual({
      activo: true,
    });
  });

  it('asigna una clave temporal y muestra el error de la política junto al campo', async () => {
    let intentos = 0;
    const { usuario } = montar({
      [`POST /usuarios/${ID}/clave-temporal`]: () => {
        intentos += 1;
        return intentos === 1
          ? json(
              {
                type: 'https://licencias.example.pe/errores/validacion',
                title: 'validacion',
                status: 422,
                errores: [{ campo: 'claveTemporal', mensaje: 'Debe tener al menos 12 caracteres' }],
              },
              422,
            )
          : sinContenido();
      },
    });
    await usuario.click(await screen.findByRole('button', { name: 'Asignar clave temporal' }));
    await usuario.type(screen.getByLabelText('Clave temporal'), 'corta');
    await usuario.click(screen.getByRole('button', { name: 'Asignar clave' }));

    expect(await screen.findByText('Debe tener al menos 12 caracteres')).toBeInTheDocument();

    await usuario.clear(screen.getByLabelText('Clave temporal'));
    await usuario.type(screen.getByLabelText('Clave temporal'), 'ClaveTemporal2026');
    await usuario.click(screen.getByRole('button', { name: 'Asignar clave' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se asignó la clave temporal');
  });

  it('un error 409 de "sobre sí mismo" se explica', async () => {
    const { usuario } = montar({
      [`POST /usuarios/${ID}/cerrar-sesiones`]: () => problema(409, 'accion-sobre-si-mismo'),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar todas sus sesiones' }));
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesiones' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('su propia cuenta');
  });

  it('un usuario que no existe lo dice', async () => {
    montar({ [`GET /usuarios/${ID}`]: () => problema(404, 'no-encontrado') });

    expect(await screen.findByRole('alert')).toHaveTextContent('El usuario no existe.');
  });
});
