import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLAVE_MODO } from '../../sesion/modo-color';
import { SelectorModo } from './SelectorModo';

// Selector del modo de color (013, US6; contracts/portal-diseno.md).

const html = () => document.documentElement;
const anuncio = () => document.querySelector('[aria-live="polite"]');

describe('SelectorModo', () => {
  afterEach(() => {
    localStorage.clear();
    html().removeAttribute('data-coreui-theme');
  });

  it('tiene el botón "Modo de color" y tres opciones menuitemradio con aria-checked', async () => {
    render(<SelectorModo />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Modo de color' }));
    const menu = screen.getByRole('menu');
    const opciones = within(menu).getAllByRole('menuitemradio');

    expect(opciones.map((opcion) => opcion.textContent)).toEqual([
      'Claro',
      'Oscuro',
      'Como el sistema',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: 'Como el sistema' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByRole('menuitemradio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('elegir "Oscuro" cambia el atributo, lo guarda y lo anuncia', async () => {
    const usuario = userEvent.setup();
    render(<SelectorModo />);

    await usuario.click(screen.getByRole('button', { name: 'Modo de color' }));
    await usuario.click(screen.getByRole('menuitemradio', { name: 'Oscuro' }));

    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('oscuro');
    expect(anuncio()).toHaveTextContent('Modo oscuro activado');
    expect(screen.getByRole('menuitemradio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('"Como el sistema" quita el atributo y lo anuncia', async () => {
    localStorage.setItem(CLAVE_MODO, 'claro');
    html().setAttribute('data-coreui-theme', 'light');
    const usuario = userEvent.setup();
    render(<SelectorModo />);

    await usuario.click(screen.getByRole('button', { name: 'Modo de color' }));
    await usuario.click(screen.getByRole('menuitemradio', { name: 'Como el sistema' }));

    expect(html()).not.toHaveAttribute('data-coreui-theme');
    expect(anuncio()).toHaveTextContent('Modo como el sistema activado');
  });

  it('el anuncio empieza vacío (no se anuncia al cargar)', () => {
    render(<SelectorModo />);

    expect(anuncio()).toBeEmptyDOMElement();
  });
});
