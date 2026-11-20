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

// Datos FICTICIOS con la forma del contrato (ExpedienteResumen).
const fila = (numero: string, estado: string, ruta: string, dia: number) => ({
  numero,
  estado,
  ruta,
  codigoReceta: 'LIC-03',
  nombreLicencia: 'Licencia de funcionamiento – riesgo alto',
  nombreTitular: 'Titular de Prueba',
  giro: 'Bodega',
  presentadoEn: `2026-11-${String(dia).padStart(2, '0')}T15:00:00.000Z`,
  vencePlazoEn: null,
  diasHabilesRestantes: null,
});

const PAGINA = {
  pagina: 1,
  porPagina: 20,
  total: 2,
  datos: [
    fila('EXP-2026-000004', 'REGISTRADO', 'B', 4),
    fila('EXP-2026-000002', 'OBSERVADO', 'A', 2),
  ],
};

const montar = (ruta: string, bandeja: Manejador, roles = ['EVALUADOR']) => {
  const consultas: URLSearchParams[] = [];
  simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    'GET /expedientes': (peticion) => {
      consultas.push(new URL(peticion.url).searchParams);
      return bandeja(peticion);
    },
  });
  montarEn(ruta);
  return consultas;
};

describe('Página Expedientes (bandeja del personal)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra los expedientes en tarjetas y en tabla, con enlace al detalle', async () => {
    montar('/personal/expedientes', () => json(PAGINA));

    const tabla = await screen.findByRole('table');
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas.map((f) => within(f).getByRole('rowheader').textContent)).toEqual([
      'EXP-2026-000004',
      'EXP-2026-000002',
    ]);
    expect(within(filas[0] as HTMLElement).getByText('Registrado')).toBeInTheDocument();
    expect(within(tabla).getByRole('link', { name: 'EXP-2026-000004' })).toHaveAttribute(
      'href',
      '/personal/expedientes/EXP-2026-000004',
    );
    const tarjetas = within(screen.getByRole('list', { name: 'Expedientes' })).getAllByRole(
      'listitem',
    );
    expect(tarjetas).toHaveLength(2);
    expect(screen.getByText('2 expedientes')).toBeInTheDocument();
  });

  it('los filtros de la URL se aplican al cargar y quedan elegidos', async () => {
    const consultas = montar('/personal/expedientes?estado=OBSERVADO&ruta=B&pagina=2', () =>
      json({ ...PAGINA, pagina: 2, total: 25 }),
    );

    await screen.findByRole('table');
    expect(consultas[0]?.get('estado')).toBe('OBSERVADO');
    expect(consultas[0]?.get('ruta')).toBe('B');
    expect(consultas[0]?.get('pagina')).toBe('2');
    expect(screen.getByLabelText('Estado')).toHaveValue('OBSERVADO');
    expect(screen.getByLabelText('Ruta')).toHaveValue('B');
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });

  it('"Filtrar" pide la bandeja con los filtros elegidos', async () => {
    const consultas = montar('/personal/expedientes', () => json(PAGINA));
    const usuario = userEvent.setup();
    await screen.findByRole('table');

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'REGISTRADO');
    await usuario.selectOptions(screen.getByLabelText('Ruta'), 'B');
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));

    await screen.findByRole('table');
    const ultima = consultas.at(-1);
    expect(ultima?.get('estado')).toBe('REGISTRADO');
    expect(ultima?.get('ruta')).toBe('B');
  });

  it('pagina con "Siguiente" y "Anterior"', async () => {
    const consultas = montar('/personal/expedientes', (peticion) => {
      const pagina = Number(new URL(peticion.url).searchParams.get('pagina') ?? '1');
      return json({ ...PAGINA, pagina, total: 45 });
    });
    const usuario = userEvent.setup();
    await screen.findByText('Página 1 de 3');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    expect(consultas.at(-1)?.get('pagina')).toBe('2');
  });

  it('sin resultados lo dice', async () => {
    montar('/personal/expedientes', () => json({ ...PAGINA, total: 0, datos: [] }));

    expect(await screen.findByText('No hay expedientes con estos filtros.')).toBeInTheDocument();
  });

  it('si falla, avisa y permite reintentar', async () => {
    let llamadas = 0;
    montar('/personal/expedientes', () => {
      llamadas += 1;
      return llamadas === 1 ? problema(503, 'servicio-no-disponible') : json(PAGINA);
    });
    const usuario = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar/);
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('otro rol ve que no tiene permiso', async () => {
    montar('/personal/expedientes', () => json(PAGINA), ['CAJA']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });
});
