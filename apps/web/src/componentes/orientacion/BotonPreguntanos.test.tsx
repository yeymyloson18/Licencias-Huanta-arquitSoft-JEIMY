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
