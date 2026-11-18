import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecetaAdminResumen } from '../../servicios/clienteApi';
import {
  json,
  problema,
  sesionDePrueba,
  simularApi,
  type Manejador,
} from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

// 12 recetas con la forma del contrato; LIC-06 desactivada.
const recetas: RecetaAdminResumen[] = [
  ...Array.from({ length: 9 }, (_, indice) => ({
    codigo: `LIC-0${String(indice + 1)}`,
    nombre: `Licencia de prueba ${String(indice + 1)}`,
    tipo: 'LICENCIA' as const,
    ruta: 'A' as const,
    tasa: indice === 8 ? '0.00' : '177.10',
    plazoDias: 2,
    activa: indice !== 5,
    actualizadaEn: '2026-11-18T10:00:00.000Z',
  })),
  ...['CGI-01', 'DUP-01', 'TRF-01'].map((codigo) => ({
    codigo,
    nombre: `Trámite ${codigo}`,
    tipo: 'TRAMITE_CONECTADO' as const,
    ruta: null,
    tasa: '45.10',
    plazoDias: null,
    activa: true,
    actualizadaEn: '2026-11-18T10:00:00.000Z',
  })),
];

const simular = (manejadores: Record<string, Manejador> = {}) =>
  simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['ADMINISTRADOR'] })),
    'GET /admin/catalogo/recetas': () => json(recetas),
    ...manejadores,
  });

describe('Catálogo del administrador (/admin/catalogo)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('lista las 12 recetas con código, nombre, tasa, plazo y estado escrito', async () => {
    simular();
    montarEn('/admin/catalogo');

    const lista = await screen.findByRole('list', { name: 'Recetas del catálogo' });
    const elementos = within(lista).getAllByRole('listitem');
    expect(elementos).toHaveLength(12);
    const primera = within(elementos[0] as HTMLElement);
    expect(
      primera.getByRole('heading', { name: 'LIC-01 Licencia de prueba 1' }),
    ).toBeInTheDocument();
    expect(primera.getByText('S/ 177.10')).toBeInTheDocument();
    expect(primera.getByText('2 días hábiles')).toBeInTheDocument();
    expect(primera.getByText('Activa')).toBeInTheDocument();
    expect(within(elementos[5] as HTMLElement).getByText('Desactivada')).toBeInTheDocument();
    expect(within(elementos[8] as HTMLElement).getByText('Gratuito')).toBeInTheDocument();
    expect(within(elementos[9] as HTMLElement).getByText('Plazo no aplica')).toBeInTheDocument();
  });

  it('cada receta enlaza a su edición', async () => {
    simular();
    montarEn('/admin/catalogo');

    expect(
      await screen.findByRole('link', { name: 'Editar LIC-02: Licencia de prueba 2' }),
    ).toHaveAttribute('href', '/admin/catalogo/LIC-02');
  });

  it('si el servicio falla muestra un aviso y permite reintentar', async () => {
    let intentos = 0;
    simular({
      'GET /admin/catalogo/recetas': () => {
        intentos += 1;
        return intentos === 1 ? new Response(null, { status: 503 }) : json(recetas);
      },
    });
    montarEn('/admin/catalogo');

    const alerta = await screen.findByRole('alert');
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findAllByRole('link', { name: /^Editar / })).toHaveLength(12);
  });

  it('con un 403 muestra que no tiene permiso', async () => {
    simular({ 'GET /admin/catalogo/recetas': () => problema(403, 'sin-permiso') });
    montarEn('/admin/catalogo');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes permiso para gestionar el catálogo.',
    );
  });

  it('sin el rol ADMINISTRADOR no muestra el catálogo', async () => {
    simular({ 'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['CAJA'] })) });
    montarEn('/admin/catalogo');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });
});
