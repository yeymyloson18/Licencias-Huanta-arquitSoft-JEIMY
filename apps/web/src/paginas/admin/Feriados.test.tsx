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

// Datos con la forma del contrato (Feriado de la 006).
const FERIADOS = [
  { fecha: '2026-07-28', descripcion: 'Fiestas Patrias', alcance: 'NACIONAL' },
  { fecha: '2026-12-25', descripcion: 'Navidad', alcance: 'NACIONAL' },
];

const montar = (manejadores: Record<string, Manejador>, roles = ['ADMINISTRADOR']) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    'GET /feriados': () => json(FERIADOS),
    ...manejadores,
  });
  montarEn('/admin/feriados');
  return { llamadas, usuario: userEvent.setup() };
};

describe('Página Feriados (006)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('lista los feriados del año con su alcance', async () => {
    montar({});

    const lista = await screen.findByRole('region', { name: /Feriados de \d{4}/ });

    expect(await within(lista).findByText(/Fiestas Patrias/)).toBeInTheDocument();
    expect(within(lista).getAllByText(/Nacional/)).toHaveLength(2);
  });

  it('registra un feriado y recarga', async () => {
    const { llamadas, usuario } = montar({
      'POST /feriados': (peticion) => peticion.json().then((c) => json(c, 201)),
    });
    await screen.findByText(/Fiestas Patrias/);

    await usuario.type(screen.getByLabelText('Fecha'), '2026-06-24');
    await usuario.type(screen.getByLabelText('Descripción'), 'Inti Raymi');
    await usuario.selectOptions(screen.getByLabelText('Alcance'), 'REGIONAL');
    await usuario.click(screen.getByRole('button', { name: 'Registrar feriado' }));

    expect(await screen.findByRole('status')).toHaveTextContent('registrado');
    expect(llamadas.find((l) => l.clave === 'POST /feriados')?.cuerpo).toEqual({
      fecha: '2026-06-24',
      descripcion: 'Inti Raymi',
      alcance: 'REGIONAL',
    });
  });

  it('sin datos no envía; una fecha repetida se explica', async () => {
    const { llamadas, usuario } = montar({
      'POST /feriados': () => problema(409, 'feriado-repetido'),
    });
    await screen.findByText(/Fiestas Patrias/);

    await usuario.click(screen.getByRole('button', { name: 'Registrar feriado' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe la fecha y la descripción');
    expect(llamadas.some((l) => l.clave === 'POST /feriados')).toBe(false);

    await usuario.type(screen.getByLabelText('Fecha'), '2026-12-25');
    await usuario.type(screen.getByLabelText('Descripción'), 'Otra');
    await usuario.click(screen.getByRole('button', { name: 'Registrar feriado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya hay un feriado registrado en esa fecha.',
    );
  });

  it('elimina con confirmación en la página', async () => {
    const { llamadas, usuario } = montar({
      'DELETE /feriados/2026-12-25': () => new Response(null, { status: 204 }),
    });
    await screen.findByText(/Navidad/);

    await usuario.click(screen.getByRole('button', { name: /Eliminar el feriado del 25 dic/ }));
    expect(llamadas.some((l) => l.clave.startsWith('DELETE'))).toBe(false);
    await usuario.click(screen.getByRole('button', { name: 'Sí, eliminar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('eliminado');
    expect(llamadas.some((l) => l.clave === 'DELETE /feriados/2026-12-25')).toBe(true);
  });

  it('otro rol ve que no tiene permiso', async () => {
    montar({}, ['EVALUADOR']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });
});
