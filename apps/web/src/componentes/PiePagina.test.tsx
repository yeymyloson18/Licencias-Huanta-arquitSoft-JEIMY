import { render, screen } from '@testing-library/react';
import { PiePagina } from './PiePagina';

describe('PiePagina (008)', () => {
  it('enlaza a la documentación interactiva de la API', () => {
    render(<PiePagina mostrarDocumentacion />);

    expect(screen.getByRole('link', { name: 'Documentación de la API' })).toHaveAttribute(
      'href',
      '/api/docs/',
    );
  });

  it('por defecto usa lo fijado al compilar; apagado no muestra nada', () => {
    const { container, rerender } = render(<PiePagina />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();

    rerender(<PiePagina mostrarDocumentacion={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
