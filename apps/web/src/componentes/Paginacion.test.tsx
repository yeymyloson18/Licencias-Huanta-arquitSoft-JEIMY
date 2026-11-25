import { fireEvent, render, screen, within } from '@testing-library/react';
import { Paginacion } from './Paginacion';

// Paginación de la bandeja, las auditorías y los usuarios (013, US5): los mismos textos de hoy con la
// estructura `pagination` de CoreUI.

describe('Paginacion', () => {
  it('muestra Anterior, la página actual y Siguiente, con aria-current en la actual', () => {
    render(<Paginacion etiqueta="Páginas" pagina={2} total={3} alCambiar={jest.fn()} />);

    const nav = screen.getByRole('navigation', { name: 'Páginas' });
    expect(within(nav).getByRole('list')).toHaveClass('pagination');
    expect(within(nav).getByText('Página 2 de 3')).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Anterior' })).toBeEnabled();
    expect(within(nav).getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('en la primera página, Anterior está desactivado; en la última, Siguiente', () => {
    const { rerender } = render(
      <Paginacion etiqueta="Páginas" pagina={1} total={2} alCambiar={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' }).closest('li')).toHaveClass('disabled');

    rerender(<Paginacion etiqueta="Páginas" pagina={2} total={2} alCambiar={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('avisa la página a la que ir', () => {
    const alCambiar = jest.fn();
    render(<Paginacion etiqueta="Páginas" pagina={2} total={3} alCambiar={alCambiar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(alCambiar.mock.calls).toEqual([[1], [3]]);
  });
});
