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
import { textoUrgencia } from './Alertas';

// Datos FICTICIOS con la forma del contrato (AlertaPlazo de la 006).
const VENCIDA = {
  id: 1,
  numeroExpediente: 'EXP-2026-000001',
  venceEn: '2026-11-18',
  diasHabilesRestantes: -2,
  estadoExpediente: 'EN_EVALUACION',
  generadaEn: '2026-11-20T15:00:00.000Z',
  atendidaEn: null,
  atendidaPor: null,
};
const PRONTO = {
  ...VENCIDA,
  id: 2,
  numeroExpediente: 'EXP-2026-000002',
  venceEn: '2026-11-24',
  diasHabilesRestantes: 1,
};

const montar = (manejadores: Record<string, Manejador>, roles = ['JEFATURA']) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    ...manejadores,
  });
  montarEn('/personal/alertas');
  return { llamadas, usuario: userEvent.setup() };
};

describe('Página Alertas (006)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra las alertas en el orden recibido con su urgencia y estado', async () => {
    montar({ 'GET /plazos/alertas': () => json([VENCIDA, PRONTO]) });

    const tarjetas = await screen.findAllByRole('article');

    expect(tarjetas.map((t) => within(t).getByRole('link').textContent)).toEqual([
      'EXP-2026-000001',
      'EXP-2026-000002',
    ]);
    expect(
      within(tarjetas[0] as HTMLElement).getByText('Vencido hace 2 días hábiles'),
    ).toBeInTheDocument();
    expect(within(tarjetas[1] as HTMLElement).getByText('Queda 1 día hábil')).toBeInTheDocument();
    expect(within(tarjetas[0] as HTMLElement).getByText('En evaluación')).toBeInTheDocument();
  });

  it('marca una alerta como atendida y recarga', async () => {
    let atendida = false;
    const { llamadas, usuario } = montar({
      'GET /plazos/alertas': () => json(atendida ? [PRONTO] : [VENCIDA, PRONTO]),
      'POST /plazos/alertas/1/atender': () => {
        atendida = true;
        return json({ ...VENCIDA, atendidaEn: '2026-11-20T16:00:00.000Z' });
      },
    });
    const tarjeta = await screen.findByRole('article', { name: 'Alerta de EXP-2026-000001' });

    await usuario.click(within(tarjeta).getByRole('button', { name: 'Marcar como atendida' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'EXP-2026-000001 marcada como atendida',
    );
    expect(await screen.findAllByRole('article')).toHaveLength(1);
    expect(llamadas.some((l) => l.clave === 'POST /plazos/alertas/1/atender')).toBe(true);
  });

  it('sin alertas lo dice; si falla, también', async () => {
    montar({ 'GET /plazos/alertas': () => json([]) });
    expect(await screen.findByText('No hay alertas pendientes.')).toBeInTheDocument();
  });

  it('un error al cargar se muestra', async () => {
    montar({ 'GET /plazos/alertas': () => problema(500, 'error') });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las alertas');
  });

  it('otro rol ve que no tiene permiso', async () => {
    montar({}, ['EVALUADOR']);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });

  it('texto de urgencia', () => {
    expect(textoUrgencia(-1)).toBe('Vencido hace 1 día hábil');
    expect(textoUrgencia(0)).toBe('Vence hoy');
    expect(textoUrgencia(2)).toBe('Quedan 2 días hábiles');
  });
});
