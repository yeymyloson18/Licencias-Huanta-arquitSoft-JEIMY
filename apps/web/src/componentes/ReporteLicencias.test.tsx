import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, simularApi } from '../pruebas/api-simulada';
import { ReporteLicencias } from './ReporteLicencias';

// Datos FICTICIOS con la forma del contrato (FilaReporte de la 007).
const FILA = {
  numero: 'LF-2026-000001',
  codigoReceta: 'LIC-02',
  titular: 'Juana P. Q.',
  giro: 'Bodega',
  zona: 'Centro',
  estado: 'VIGENTE',
  fecha: '2026-11-20',
};
const RECETAS = [
  {
    codigo: 'LIC-02',
    nombre: 'Licencia riesgo medio',
    tipo: 'LICENCIA',
    ruta: 'A',
    tasa: '177.10',
    plazoDias: 2,
  },
];

describe('Reporte de licencias (007)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filtra por situación, licencia, giro y zona y muestra el titular público', async () => {
    let consulta: Record<string, string> = {};
    simularApi({
      'GET /catalogo/recetas': () => json(RECETAS),
      'GET /reportes/licencias': (peticion) => {
        consulta = Object.fromEntries(new URL(peticion.url).searchParams);
        return json([FILA], 200, { 'X-Reporte-Truncado': 'false' });
      },
    });
    const usuario = userEvent.setup();
    render(<ReporteLicencias />);

    await usuario.selectOptions(screen.getByLabelText('Situación'), 'ITSE_POR_VENCER');
    await usuario.selectOptions(
      await screen.findByLabelText('Licencia'),
      await screen.findByRole('option', { name: 'LIC-02 – Licencia riesgo medio' }),
    );
    await usuario.type(screen.getByLabelText('Giro'), 'Bodega');
    await usuario.type(screen.getByLabelText('Zona'), ' Centro ');
    await usuario.click(screen.getByRole('button', { name: 'Ver reporte' }));

    const tabla = within(await screen.findByRole('region', { name: 'Resultado del reporte' }));
    expect(tabla.getByRole('columnheader', { name: 'Vence el ITSE' })).toBeInTheDocument();
    expect(tabla.getByRole('cell', { name: 'Juana P. Q.' })).toBeInTheDocument();
    expect(consulta).toEqual({
      situacion: 'ITSE_POR_VENCER',
      codigoReceta: 'LIC-02',
      giro: 'Bodega',
      zona: 'Centro',
    });
  });

  it('avisa cuando el reporte está truncado y cuando no hay filas', async () => {
    let truncado = true;
    simularApi({
      'GET /catalogo/recetas': () => json(RECETAS),
      'GET /reportes/licencias': () =>
        truncado
          ? json([FILA], 200, { 'X-Reporte-Truncado': 'true' })
          : json([], 200, { 'X-Reporte-Truncado': 'false' }),
    });
    const usuario = userEvent.setup();
    render(<ReporteLicencias />);

    await usuario.click(screen.getByRole('button', { name: 'Ver reporte' }));
    expect(await screen.findByText(/primeras 5,000 filas/)).toBeInTheDocument();

    truncado = false;
    await usuario.click(screen.getByRole('button', { name: 'Ver reporte' }));
    expect(await screen.findByText('No hay licencias con esos filtros.')).toBeInTheDocument();
  });

  it('descarga el CSV con el nombre del servidor', async () => {
    simularApi({
      'GET /catalogo/recetas': () => json(RECETAS),
      'GET /reportes/licencias': () =>
        new Response('﻿numero;codigoReceta\r\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="reporte-vigentes-2026-11-20.csv"',
            'X-Reporte-Truncado': 'false',
          },
        }),
    });
    const crearUrl = jest.fn(() => 'blob:reporte');
    Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: jest.fn() });
    const clic = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const usuario = userEvent.setup();
    render(<ReporteLicencias />);

    await usuario.click(screen.getByRole('button', { name: 'Descargar CSV' }));

    await screen.findByRole('button', { name: 'Descargar CSV' });
    expect(crearUrl).toHaveBeenCalled();
    expect((clic.mock.instances[0] as unknown as HTMLAnchorElement | undefined)?.download).toBe(
      'reporte-vigentes-2026-11-20.csv',
    );
  });

  it('errores del reporte y de la descarga', async () => {
    simularApi({
      'GET /catalogo/recetas': () => problema(500, 'error'),
      'GET /reportes/licencias': () => problema(403, 'sin-permiso'),
    });
    const usuario = userEvent.setup();
    render(<ReporteLicencias />);

    await usuario.click(screen.getByRole('button', { name: 'Ver reporte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no tiene permiso');

    await usuario.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    expect(await screen.findAllByRole('alert')).toHaveLength(2);
  });
});
