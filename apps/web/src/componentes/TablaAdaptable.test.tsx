import { render, screen } from '@testing-library/react';
import { TablaAdaptable } from './TablaAdaptable';

// Contenedor de tablas (013, US4): la tabla se desplaza dentro de él, no la página.

describe('TablaAdaptable', () => {
  it('envuelve la tabla en table-responsive y conserva el título y los encabezados', () => {
    render(
      <TablaAdaptable>
        <table className="table">
          <caption>Expedientes</caption>
          <thead>
            <tr>
              <th scope="col">Número</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>EXP-2026-000001</td>
            </tr>
          </tbody>
        </table>
      </TablaAdaptable>,
    );

    const tabla = screen.getByRole('table', { name: 'Expedientes' });

    expect(tabla.parentElement).toHaveClass('table-responsive');
    expect(screen.getByRole('columnheader', { name: 'Número' })).toBeInTheDocument();
  });

  it('con etiqueta, el contenedor es una región que se alcanza con el teclado', () => {
    render(
      <TablaAdaptable etiqueta="Detalle por licencia">
        <table className="table">
          <tbody>
            <tr>
              <td>LIC-01</td>
            </tr>
          </tbody>
        </table>
      </TablaAdaptable>,
    );

    const region = screen.getByRole('region', { name: 'Detalle por licencia' });

    expect(region).toHaveClass('table-responsive');
    expect(region).toHaveAttribute('tabindex', '0');
  });
});
