import { render, screen } from '@testing-library/react';
import { HerramientasTecnicas } from './HerramientasTecnicas';

describe('HerramientasTecnicas (010)', () => {
  it('enlaza a Swagger y al buzón de pruebas', () => {
    render(<HerramientasTecnicas mostrar urlBuzon="http://localhost:8025/" />);

    expect(screen.getByRole('link', { name: 'Documentación de la API (Swagger)' })).toHaveAttribute(
      'href',
      '/api/docs/',
    );
    expect(
      screen.getByRole('link', { name: 'Buzón de pruebas (códigos y avisos)' }),
    ).toHaveAttribute('href', 'http://localhost:8025/');
  });

  it('por defecto usa lo fijado al compilar y el puerto 8025 del mismo equipo', () => {
    render(<HerramientasTecnicas />);

    expect(screen.getByRole('heading', { name: 'Herramientas técnicas' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Buzón de pruebas (códigos y avisos)' }),
    ).toHaveAttribute('href', `${window.location.protocol}//${window.location.hostname}:8025/`);
  });

  it('apagado (producción) no muestra nada', () => {
    const { container } = render(<HerramientasTecnicas mostrar={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
