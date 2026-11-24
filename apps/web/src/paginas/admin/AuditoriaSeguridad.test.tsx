import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  json,
  problema,
  sesionDePrueba,
  simularApi,
  usuarioDePrueba,
  type Manejador,
} from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

// Datos FICTICIOS con la forma del contrato (EventoAuditoriaSeguridad de la 009).
const ADMIN = { id: '00000000-0000-4000-8000-0000000000aa', nombre: 'Ana Admin' };
const BETO = { id: '00000000-0000-4000-8000-0000000000bb', nombre: 'Beto Caja' };
const evento = (id: string, cambios: Record<string, unknown> = {}) => ({
  id,
  ocurridoEn: '2026-11-23T20:05:00Z',
  accion: 'ROL_ASIGNADO',
  textoAccion: 'Rol asignado',
  actor: ADMIN,
  afectado: BETO,
  objeto: null,
  resultado: 'EXITO',
  ...cambios,
});
const PAGINA = {
  pagina: 1,
  porPagina: 20,
  total: 3,
  datos: [
    evento('3'),
    evento('2', {
      accion: 'CLAVE_INCORRECTA',
      textoAccion: 'Clave incorrecta',
      actor: null,
      resultado: 'RECHAZADO',
    }),
    evento('1', {
      accion: 'RECETA_ACTUALIZADA',
      textoAccion: 'Receta actualizada',
      afectado: null,
      objeto: 'LIC-01',
    }),
  ],
};
const USUARIOS = {
  pagina: 1,
  porPagina: 100,
  total: 1,
  datos: [usuarioDePrueba({ id: BETO.id, nombreCompleto: BETO.nombre })],
};

const montar = (manejadores: Record<string, Manejador>, ruta = '/admin/auditoria') => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['ADMINISTRADOR'] })),
    'GET /catalogo/recetas': () => json([]),
    'GET /usuarios': () => json(USUARIOS),
    ...manejadores,
  });
  montarEn(ruta);
  return { llamadas, usuario: userEvent.setup() };
};

describe('Auditoría de seguridad (009)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('lista los eventos con quién, sobre quién o qué y el resultado', async () => {
    montar({ 'GET /admin/auditoria': () => json(PAGINA) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Auditoría de seguridad' }),
    ).toBeInTheDocument();
    const tabla = within(await screen.findByRole('region', { name: 'Eventos de la auditoría' }));
    const filas = tabla.getAllByRole('row');
    expect(filas).toHaveLength(4);
    expect(within(filas[1] as HTMLElement).getByText('Rol asignado')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('Ana Admin')).toBeInTheDocument();
    expect(within(filas[2] as HTMLElement).getByText('Sin sesión')).toBeInTheDocument();
    expect(within(filas[2] as HTMLElement).getByText('Rechazado')).toBeInTheDocument();
    expect(within(filas[3] as HTMLElement).getByText('LIC-01')).toBeInTheDocument();
    expect(within(filas[3] as HTMLElement).getByText('Éxito')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument();
  });

  it('filtra por fechas, acción y usuario afectado enviando solo identificadores', async () => {
    const consultas: Record<string, string>[] = [];
    const { usuario } = montar({
      'GET /admin/auditoria': (peticion) => {
        consultas.push(Object.fromEntries(new URL(peticion.url).searchParams));
        return json(PAGINA);
      },
    });
    await screen.findByRole('region', { name: 'Eventos de la auditoría' });
    await screen.findAllByRole('option', { name: BETO.nombre });

    await usuario.type(screen.getByLabelText('Desde'), '2026-11-01');
    await usuario.type(screen.getByLabelText('Hasta'), '2026-11-23');
    await usuario.selectOptions(screen.getByLabelText('Acción'), 'CLAVE_INCORRECTA');
    await usuario.selectOptions(screen.getByLabelText('Usuario afectado'), BETO.id);
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));

    await screen.findByRole('region', { name: 'Eventos de la auditoría' });
    expect(consultas.at(-1)).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-23',
      accion: 'CLAVE_INCORRECTA',
      afectadoId: BETO.id,
      pagina: '1',
      porPagina: '20',
    });
  });

  it('lee el usuario afectado de la dirección (enlace desde la ficha)', async () => {
    const consultas: Record<string, string>[] = [];
    montar(
      {
        'GET /admin/auditoria': (peticion) => {
          consultas.push(Object.fromEntries(new URL(peticion.url).searchParams));
          return json(PAGINA);
        },
      },
      `/admin/auditoria?afectadoId=${BETO.id}`,
    );

    await screen.findByRole('region', { name: 'Eventos de la auditoría' });
    expect(consultas[0]).toMatchObject({ afectadoId: BETO.id });
  });

  it('pasa a la página siguiente', async () => {
    const paginas: string[] = [];
    const { usuario } = montar({
      'GET /admin/auditoria': (peticion) => {
        const pagina = new URL(peticion.url).searchParams.get('pagina') ?? '1';
        paginas.push(pagina);
        return json({ ...PAGINA, total: 45, pagina: Number(pagina) });
      },
    });
    await screen.findByText('Página 1 de 3');

    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    expect(paginas).toEqual(['1', '2']);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });

  it('sin eventos lo dice', async () => {
    montar({ 'GET /admin/auditoria': () => json({ ...PAGINA, total: 0, datos: [] }) });

    expect(await screen.findByText('No hay eventos con esos filtros.')).toBeInTheDocument();
  });

  it('un rango inválido marca el filtro con el mensaje del servidor', async () => {
    montar({
      'GET /admin/auditoria': () =>
        json(
          {
            type: 'https://licencias.example.pe/errores/validacion',
            title: 'validacion',
            status: 422,
            errores: [{ campo: 'desde', mensaje: 'Debe ser una fecha válida' }],
          },
          422,
        ),
    });

    expect(await screen.findByText('Debe ser una fecha válida')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los filtros marcados.');
  });

  it('sin permiso lo dice', async () => {
    montar({ 'GET /admin/auditoria': () => problema(403, 'sin-permiso') });

    expect(await screen.findByRole('alert')).toHaveTextContent('no tiene permiso');
  });

  it('descarga el CSV con los mismos filtros y avisa si está truncado', async () => {
    const consultas: Record<string, string>[] = [];
    const crearUrl = jest.fn(() => 'blob:auditoria');
    Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: jest.fn() });
    const { usuario } = montar({
      'GET /admin/auditoria': (peticion) => {
        const consulta = Object.fromEntries(new URL(peticion.url).searchParams);
        consultas.push(consulta);
        return consulta.formato === 'csv'
          ? new Response('﻿fecha;accion\r\n', {
              headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="auditoria-seguridad-2026-11-23.csv"',
                'X-Auditoria-Truncada': 'true',
              },
            })
          : json(PAGINA);
      },
    });
    await screen.findByRole('region', { name: 'Eventos de la auditoría' });

    await usuario.selectOptions(screen.getByLabelText('Acción'), 'ROL_ASIGNADO');
    await usuario.click(screen.getByRole('button', { name: 'Descargar CSV' }));

    expect(await screen.findByRole('status')).toHaveTextContent('10,000 filas más recientes');
    expect(consultas.at(-1)).toEqual({ accion: 'ROL_ASIGNADO', formato: 'csv' });
    expect(crearUrl).toHaveBeenCalled();
  });
});
