import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { json, simularApi } from '../../pruebas/api-simulada';
import { BotonPreguntanos } from './BotonPreguntanos';
import type { MensajeChat } from './conversacion';

// Botón "Pregúntanos" (012, contracts/portal-orientacion.md). La conversación vive fuera del botón
// (en el diseño común), así que se conserva al cerrar y abrir el chat.

function Prueba() {
  const [conversacion, setConversacion] = useState<MensajeChat[]>([]);
  return <BotonPreguntanos conversacion={conversacion} alCambiar={setConversacion} />;
}

describe('BotonPreguntanos (US1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('abre el chat; al cerrarlo y abrirlo, la conversación sigue', async () => {
    simularApi({
      'POST /orientacion/preguntas': () =>
        json({
          resultado: 'RESPONDIDA',
          texto: 'En la caja de la Municipalidad.',
          enlaces: [],
          aclaracion: null,
          datoPersonalQuitado: false,
        }),
    });
    const usuario = userEvent.setup();
    render(
      <MemoryRouter>
        <Prueba />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Escriba su pregunta')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Pregúntanos' }));
    await usuario.type(screen.getByLabelText('Escriba su pregunta'), '¿Dónde pago?');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('En la caja de la Municipalidad.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('En la caja de la Municipalidad.')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Pregúntanos' }));
    expect(screen.getByText('¿Dónde pago?')).toBeInTheDocument();
    expect(screen.getByText('En la caja de la Municipalidad.')).toBeInTheDocument();
  });
});

describe('BotonPreguntanos: celular, teclado y lector de pantalla (US6)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const montarBoton = () => {
    simularApi({
      'POST /orientacion/preguntas': () =>
        json({
          resultado: 'RESPONDIDA',
          texto: 'Vea la ficha.',
          enlaces: [{ tipo: 'FICHA', codigoReceta: 'LIC-02' }],
          aclaracion: null,
          datoPersonalQuitado: false,
        }),
    });
    const usuario = userEvent.setup();
    render(
      <MemoryRouter>
        <Prueba />
      </MemoryRouter>,
    );
    return usuario;
  };

  it('el botón anuncia que abre un diálogo y si está abierto', async () => {
    const usuario = montarBoton();
    const boton = screen.getByRole('button', { name: 'Pregúntanos' });

    expect(boton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
  });

  it('al abrir, el foco va al campo; el diálogo tiene su título', async () => {
    const usuario = montarBoton();

    await usuario.click(screen.getByRole('button', { name: 'Pregúntanos' }));

    expect(screen.getByLabelText('Escriba su pregunta')).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Pregúntanos sobre licencias' })).toBeInTheDocument();
  });

  it.each([
    ['Escape', async (usuario: ReturnType<typeof userEvent.setup>) => usuario.keyboard('{Escape}')],
    [
      'el botón Cerrar',
      async (usuario: ReturnType<typeof userEvent.setup>) =>
        usuario.click(screen.getByRole('button', { name: 'Cerrar' })),
    ],
  ])('%s cierra el chat y el foco vuelve a "Pregúntanos"', async (_caso, cerrar) => {
    const usuario = montarBoton();
    await usuario.click(screen.getByRole('button', { name: 'Pregúntanos' }));

    await cerrar(usuario);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pregúntanos' })).toHaveFocus();
  });

  it('las respuestas se anuncian en una región aria-live="polite" sin mover el foco', async () => {
    const usuario = montarBoton();
    await usuario.click(screen.getByRole('button', { name: 'Pregúntanos' }));
    await usuario.type(screen.getByLabelText('Escriba su pregunta'), '¿Cuánto cuesta?{Enter}');

    const respuesta = await screen.findByText('Vea la ficha.');

    expect(respuesta.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByLabelText('Escriba su pregunta')).toHaveFocus();
  });

  it('seguir un enlace cierra el chat y conserva la conversación', async () => {
    const usuario = montarBoton();
    await usuario.click(screen.getByRole('button', { name: 'Pregúntanos' }));
    await usuario.type(screen.getByLabelText('Escriba su pregunta'), '¿Cuánto cuesta?{Enter}');

    await usuario.click(await screen.findByRole('link', { name: 'Ver la ficha de LIC-02' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Pregúntanos' }));
    expect(screen.getByText('Vea la ficha.')).toBeInTheDocument();
  });
});
