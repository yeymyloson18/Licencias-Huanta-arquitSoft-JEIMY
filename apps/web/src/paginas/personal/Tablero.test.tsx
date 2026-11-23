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
import { textoDentroDelPlazo, textoPromedio } from './Tablero';

// Datos FICTICIOS con la forma del contrato (Tablero de la 007).
const TABLERO = {
  desde: '2026-11-01',
  hasta: '2026-11-20',
  generadoEn: '2026-11-20T15:00:00.000Z',
  expedientesPorEstado: { PAGADO: 3, OBSERVADO: 1, EN_EVALUACION: 0 },
  tiempoPromedioPorReceta: [
    {
      codigoReceta: 'LIC-02',
      plazoTupaDias: 2,
      atendidos: 3,
      promedioDiasHabiles: 2.3,
      dentroDelPlazo: 66.7,
    },
    {
      codigoReceta: 'LIC-03',
      plazoTupaDias: 8,
      atendidos: 0,
      promedioDiasHabiles: null,
      dentroDelPlazo: null,
    },
  ],
  ingresos: { total: '483.10', porReceta: { 'LIC-02': '177.20', 'LIC-03': '305.90' } },
};

const montar = (manejadores: Record<string, Manejador>, roles = ['JEFATURA']) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    ...manejadores,
  });
  montarEn('/personal/tablero');
  return { llamadas, usuario: userEvent.setup() };
};

describe('Página Tablero (007)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra el mes actual con estados, tiempos e ingresos, con gráficos y tablas', async () => {
    montar({ 'GET /reportes/tablero': () => json(TABLERO) });

    const estados = await screen.findByRole('region', { name: 'Expedientes por estado' });

    expect(within(estados).getByText('4 expedientes presentados en el rango.')).toBeInTheDocument();
    expect(
      within(estados).getByRole('img', { name: 'Expedientes por estado' }),
    ).toHaveAccessibleDescription('Expedientes por estado: Pagado, 3; Observado, 1.');
    const tiempos = screen.getByRole('region', {
      name: 'Tiempo de atención frente al plazo del TUPA',
    });
    const fila = within(tiempos).getByRole('row', { name: /LIC-03/ });
    expect(
      within(fila)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['8 días', '0', 'Sin datos', 'Sin datos']);
    expect(screen.getByText(/483\.10/)).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-11-20');
  });

  it('pide otro rango y muestra los errores de validación junto a los campos', async () => {
    const { llamadas, usuario } = montar({
      'GET /reportes/tablero': (peticion) =>
        new URL(peticion.url).searchParams.get('desde') === '2026-12-01'
          ? json(
              {
                title: 'validacion',
                status: 422,
                errores: [
                  { campo: 'hasta', mensaje: 'Debe ser igual o posterior a la fecha de inicio' },
                ],
              },
              422,
              { 'Content-Type': 'application/problem+json' },
            )
          : json(TABLERO),
    });
    const desde = await screen.findByLabelText('Desde');
    await screen.findByRole('region', { name: 'Expedientes por estado' });

    await usuario.clear(desde);
    await usuario.type(desde, '2026-12-01');
    await usuario.click(screen.getByRole('button', { name: 'Ver tablero' }));

    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha de inicio'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa las fechas');
    expect(llamadas.filter((l) => l.clave === 'GET /reportes/tablero')).toHaveLength(2);
  });

  it('rango sin datos lo dice', async () => {
    montar({
      'GET /reportes/tablero': () =>
        json({
          ...TABLERO,
          expedientesPorEstado: {},
          tiempoPromedioPorReceta: [],
          ingresos: { total: '0.00', porReceta: {} },
        }),
    });

    expect(await screen.findByText('No hay datos en este rango.')).toBeInTheDocument();
    expect(screen.getByText('0 expedientes presentados en el rango.')).toBeInTheDocument();
  });

  it('un error al cargar se muestra; otro rol no entra', async () => {
    montar({ 'GET /reportes/tablero': () => problema(500, 'error') });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el tablero');
  });

  it('otro rol ve que no tiene permiso', async () => {
    montar({}, ['EVALUADOR']);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });

  it('textos de promedio y de porcentaje', () => {
    expect(textoPromedio(null)).toBe('Sin datos');
    expect(textoPromedio(2.5)).toBe('2.5 días');
    expect(textoDentroDelPlazo(null, 0, 2)).toBe('No aplica');
    expect(textoDentroDelPlazo(50, 2, 2)).toBe('50 %');
    expect(textoDentroDelPlazo(null, 2, 0)).toBe('Sin datos');
  });
});
