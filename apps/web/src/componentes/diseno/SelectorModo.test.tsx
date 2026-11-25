import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { simularMedios } from '../../pruebas/medios';
import { CLAVE_MODO } from '../../sesion/modo-color';
import { SelectorModo } from './SelectorModo';

// Botón del modo de color (013, US6; FR-019 corregido): alterna entre claro y oscuro; su nombre dice a
// qué modo cambia. No hay opción "Como el sistema".

const html = () => document.documentElement;
const anuncio = () => document.querySelector('[aria-live="polite"]');

describe('SelectorModo', () => {
  afterEach(() => {
    localStorage.clear();
    html().removeAttribute('data-coreui-theme');
  });

  it('es un solo botón, sin menú ni opción "sistema"', () => {
    render(<SelectorModo />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText(/sistema/i)).not.toBeInTheDocument();
  });

  it('con el dispositivo en claro y sin elección, ofrece "Cambiar a modo oscuro" con la luna', () => {
    render(<SelectorModo />);

    const boton = screen.getByRole('button', { name: 'Cambiar a modo oscuro' });
    expect(boton.querySelector('svg')).toHaveAttribute('data-icono', 'luna');
  });

  it('con el dispositivo en oscuro y sin elección, ofrece "Cambiar a modo claro" con el sol', () => {
    simularMedios({ oscuro: true });
    render(<SelectorModo />);

    const boton = screen.getByRole('button', { name: 'Cambiar a modo claro' });
    expect(boton.querySelector('svg')).toHaveAttribute('data-icono', 'sol');
  });

  it('respeta la elección guardada aunque el dispositivo esté en el contrario', () => {
    simularMedios({ oscuro: true });
    localStorage.setItem(CLAVE_MODO, 'claro');
    render(<SelectorModo />);

    expect(screen.getByRole('button', { name: 'Cambiar a modo oscuro' })).toBeInTheDocument();
  });

  it('al usarlo alterna, guarda la elección y lo anuncia', async () => {
    const usuario = userEvent.setup();
    render(<SelectorModo />);

    await usuario.click(screen.getByRole('button', { name: 'Cambiar a modo oscuro' }));

    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('oscuro');
    expect(anuncio()).toHaveTextContent('Modo oscuro activado');

    await usuario.click(screen.getByRole('button', { name: 'Cambiar a modo claro' }));

    expect(html()).toHaveAttribute('data-coreui-theme', 'light');
    expect(localStorage.getItem(CLAVE_MODO)).toBe('claro');
    expect(anuncio()).toHaveTextContent('Modo claro activado');
  });

  it('se usa con el teclado', async () => {
    const usuario = userEvent.setup();
    render(<SelectorModo />);

    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Cambiar a modo oscuro' })).toHaveFocus();
    await usuario.keyboard('{Enter}');

    expect(html()).toHaveAttribute('data-coreui-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Cambiar a modo claro' })).toHaveFocus();
  });

  it('el anuncio empieza vacío (no se anuncia al cargar)', () => {
    render(<SelectorModo />);

    expect(anuncio()).toBeEmptyDOMElement();
  });
});
