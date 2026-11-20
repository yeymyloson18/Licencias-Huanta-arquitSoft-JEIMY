import { render, screen, within } from '@testing-library/react';
import { GraficoBarras, resumenDe } from './GraficoBarras';

describe('GraficoBarras (007)', () => {
  it('tiene título, resumen en texto y una tabla con los mismos datos', () => {
    render(
      <GraficoBarras
        titulo="Expedientes por estado"
        columnas={['Estado', 'Cantidad']}
        barras={[
          { etiqueta: 'Pagado', valor: 3 },
          { etiqueta: 'Observado', valor: 1 },
        ]}
      />,
    );

    const grafico = screen.getByRole('img', { name: 'Expedientes por estado' });
    expect(grafico).toHaveAccessibleDescription('Expedientes por estado: Pagado, 3; Observado, 1.');
    const tabla = within(screen.getByRole('region', { name: 'Tabla: Expedientes por estado' }));
    expect(tabla.getByRole('rowheader', { name: 'Pagado' })).toBeInTheDocument();
    expect(tabla.getByRole('cell', { name: '3' })).toBeInTheDocument();
  });

  it('con marcas agrega la leyenda; sin barras no dibuja el SVG', () => {
    const { rerender } = render(
      <GraficoBarras
        titulo="Promedio"
        columnas={['Licencia', 'Promedio']}
        leyendaMarca="La línea marca el plazo."
        barras={[
          { etiqueta: 'Una licencia con nombre muy largo', valor: 2, texto: '2 días', marca: 3 },
        ]}
      />,
    );
    expect(screen.getByText(/La línea marca el plazo\./)).toBeInTheDocument();
    expect(screen.getByText('Una licencia co…')).toBeInTheDocument();

    rerender(<GraficoBarras titulo="Ingresos" columnas={['Licencia', 'Monto']} barras={[]} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Ingresos: sin datos.')).toBeInTheDocument();
  });

  it('resumen con el texto de cada valor', () => {
    expect(resumenDe('Ingresos', [{ etiqueta: 'LIC-02', valor: 177.1, texto: 'S/ 177.10' }])).toBe(
      'Ingresos: LIC-02, S/ 177.10.',
    );
  });
});
