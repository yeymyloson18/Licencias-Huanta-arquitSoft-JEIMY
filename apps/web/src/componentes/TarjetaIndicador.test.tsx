import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TarjetaIndicador } from './TarjetaIndicador';

// Tarjeta de un indicador del tablero o del panel (013, US3; contracts/portal-diseno.md).

const montar = (elemento: React.ReactNode) => render(<MemoryRouter>{elemento}</MemoryRouter>);

describe('TarjetaIndicador', () => {
  it('el número se lee dentro de la región con el nombre del indicador', () => {
    montar(<TarjetaIndicador nombre="Sesiones abiertas" valor={7} />);

    const tarjeta = screen.getByRole('region', { name: 'Sesiones abiertas' });

    expect(within(tarjeta).getByText('7')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('heading', { name: 'Sesiones abiertas' })).toBeInTheDocument();
  });

  it('muestra el detalle debajo del número', () => {
    montar(
      <TarjetaIndicador nombre="Usuarios" valor="5 activos">
        <p>2 inactivos</p>
      </TarjetaIndicador>,
    );

    const tarjeta = within(screen.getByRole('region', { name: 'Usuarios' }));

    expect(tarjeta.getByText('5 activos')).toBeInTheDocument();
    expect(tarjeta.getByText('2 inactivos')).toBeInTheDocument();
  });

  it('con ruta, la tarjeta es un enlace con el nombre del indicador', () => {
    montar(<TarjetaIndicador nombre="Cuentas bloqueadas" valor={1} ruta="/admin/auditoria" />);

    expect(screen.getByRole('link', { name: 'Cuentas bloqueadas' })).toHaveAttribute(
      'href',
      '/admin/auditoria',
    );
  });

  it('sin ruta no es interactiva', () => {
    montar(<TarjetaIndicador nombre="Sesiones abiertas" valor={7} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sin valor (por ejemplo, un dato no disponible) solo muestra el detalle', () => {
    montar(
      <TarjetaIndicador nombre="Cuentas bloqueadas">
        <p role="status">No disponible</p>
      </TarjetaIndicador>,
    );

    const tarjeta = within(screen.getByRole('region', { name: 'Cuentas bloqueadas' }));

    expect(tarjeta.getByRole('status')).toHaveTextContent('No disponible');
    expect(tarjeta.queryByText('0')).not.toBeInTheDocument();
  });

  it.each(['primary', 'success', 'warning', 'danger', 'info'] as const)(
    'la variante %s pone su acento de color',
    (variante) => {
      montar(<TarjetaIndicador nombre="Indicador" valor={1} variante={variante} />);

      expect(screen.getByRole('region', { name: 'Indicador' })).toHaveClass(
        `tarjeta-indicador--${variante}`,
      );
    },
  );
});
