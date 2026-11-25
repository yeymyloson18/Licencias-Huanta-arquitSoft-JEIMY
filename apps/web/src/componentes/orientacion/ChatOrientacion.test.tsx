import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { json, simularApi } from '../../pruebas/api-simulada';
import { ChatOrientacion } from './ChatOrientacion';
import type { MensajeChat } from './conversacion';

// Chat de orientación (012, contracts/portal-orientacion.md). Datos FICTICIOS; la API está simulada.

const respuesta = (cambios: Record<string, unknown> = {}) => ({
  resultado: 'RESPONDIDA',
  texto: 'La licencia de riesgo medio cuesta S/ 177.10.',
  enlaces: [{ tipo: 'FICHA', codigoReceta: 'LIC-02' }],
  aclaracion:
    'Esta es una orientación. Lo oficial es la ficha de cada licencia y la Municipalidad.',
  datoPersonalQuitado: false,
  ...cambios,
});

function Prueba({ inicial = [] }: { readonly inicial?: MensajeChat[] }) {
  const [conversacion, setConversacion] = useState<MensajeChat[]>(inicial);
  return (
    <ChatOrientacion conversacion={conversacion} alCambiar={setConversacion} alCerrar={() => {}} />
  );
}

const montar = (inicial?: MensajeChat[]) => {
  const usuario = userEvent.setup();
  render(
    <MemoryRouter>
      <Prueba inicial={inicial} />
    </MemoryRouter>,
  );
  return usuario;
};

const escribirYEnviar = async (usuario: ReturnType<typeof userEvent.setup>, texto: string) => {
  await usuario.type(screen.getByLabelText('Escriba su pregunta'), texto);
  await usuario.click(screen.getByRole('button', { name: 'Enviar' }));
};

describe('ChatOrientacion (US1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saluda explicando su alcance y ofrece 3 preguntas de ejemplo (FR-002)', () => {
    simularApi({});
    montar();

    expect(
      screen.getByText(
        /Puedo orientarle sobre las licencias de funcionamiento del TUPA 2024 de Huanta/,
      ),
    ).toBeInTheDocument();
    for (const ejemplo of [
      '¿Qué licencia necesito para una bodega?',
      '¿Cuánto cuesta y cuánto demora?',
      '¿Cómo pago?',
    ]) {
      expect(screen.getByRole('button', { name: ejemplo })).toBeInTheDocument();
    }
  });

  it('al enviar muestra "Preparando la respuesta…" y luego la respuesta con el enlace a la ficha', async () => {
    let responder: (valor: Response) => void = () => {};
    const llamadas = simularApi({
      'POST /orientacion/preguntas': () =>
        new Promise<Response>((resolver) => {
          responder = resolver;
        }),
    });
    const usuario = montar();

    await escribirYEnviar(usuario, '¿Cuánto cuesta la de riesgo medio?');

    expect(await screen.findByText('Preparando la respuesta…')).toBeInTheDocument();
    responder(json(respuesta()));
    expect(
      await screen.findByText('La licencia de riesgo medio cuesta S/ 177.10.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver la ficha de LIC-02' })).toHaveAttribute(
      'href',
      '/licencias/LIC-02',
    );
    expect(screen.queryByText('Preparando la respuesta…')).not.toBeInTheDocument();
    expect(screen.getByText('¿Cuánto cuesta la de riesgo medio?')).toBeInTheDocument();
    expect(llamadas[0]?.cuerpo).toEqual({
      pregunta: '¿Cuánto cuesta la de riesgo medio?',
      historial: [],
    });
    // Operación pública: nunca envía el token del personal (T023).
    expect(llamadas[0]?.autorizacion).toBeNull();
    // El campo se vacía después de enviar.
    expect(screen.getByLabelText('Escriba su pregunta')).toHaveValue('');
  });

  it('una pregunta de ejemplo se envía al pulsarla', async () => {
    const llamadas = simularApi({ 'POST /orientacion/preguntas': () => json(respuesta()) });
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: '¿Cómo pago?' }));

    await waitFor(() => {
      expect(llamadas[0]?.cuerpo).toEqual({ pregunta: '¿Cómo pago?', historial: [] });
    });
  });

  it('muestra el texto literal, nunca como HTML', async () => {
    simularApi({
      'POST /orientacion/preguntas': () =>
        json(respuesta({ texto: 'Tasa <b>alta</b>\nsegunda línea', enlaces: [] })),
    });
    const usuario = montar();

    await escribirYEnviar(usuario, 'hola');

    expect(await screen.findByText(/Tasa <b>alta<\/b>/)).toBeInTheDocument();
    expect(document.querySelector('.chat-orientacion b')).toBeNull();
  });

  it('una pregunta de seguimiento envía como historial los últimos 6 turnos', async () => {
    const llamadas = simularApi({ 'POST /orientacion/preguntas': () => json(respuesta()) });
    const anteriores: MensajeChat[] = Array.from({ length: 8 }, (_, indice) => ({
      id: indice + 1,
      autor: indice % 2 === 0 ? 'PERSONA' : 'ORIENTADOR',
      texto: `turno ${String(indice + 1)}`,
    }));
    const usuario = montar(anteriores);

    await escribirYEnviar(usuario, '¿y cuánto demora?');

    await waitFor(() => {
      expect(llamadas).toHaveLength(1);
    });
    expect(llamadas[0]?.cuerpo).toEqual({
      pregunta: '¿y cuánto demora?',
      historial: [3, 4, 5, 6, 7, 8].map((numero) => ({
        rol: numero % 2 === 1 ? 'PERSONA' : 'ORIENTADOR',
        texto: `turno ${String(numero)}`,
      })),
    });
  });
});

describe('ChatOrientacion: nunca datos inventados (US2)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('muestra la aclaración debajo de una respuesta', async () => {
    simularApi({ 'POST /orientacion/preguntas': () => json(respuesta()) });
    const usuario = montar();

    await escribirYEnviar(usuario, '¿Cuánto cuesta?');

    const aclaracion = await screen.findByText(
      'Esta es una orientación. Lo oficial es la ficha de cada licencia y la Municipalidad.',
    );
    expect(aclaracion).toHaveClass('chat-orientacion__aclaracion');
  });

  it('con SIN_INFORMACION muestra el texto y el enlace a la lista de licencias', async () => {
    simularApi({
      'POST /orientacion/preguntas': () =>
        json(
          respuesta({
            resultado: 'SIN_INFORMACION',
            texto:
              'No tengo esa información. Le recomiendo consultar en Mesa de partes de la Municipalidad Provincial de Huanta.',
            enlaces: [{ tipo: 'LICENCIAS' }],
            aclaracion: null,
          }),
        ),
    });
    const usuario = montar();

    await escribirYEnviar(usuario, '¿Cuánto cuesta un permiso de anuncios?');

    expect(await screen.findByText(/No tengo esa información/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver la lista de licencias' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByText(/Esta es una orientación/)).not.toBeInTheDocument();
  });
});

describe('ChatOrientacion: los datos personales no salen (US3)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('el saludo dice que no hace falta escribir el DNI, el RUC, el celular ni el correo', () => {
    simularApi({});
    montar();

    expect(
      screen.getByText(/no hace falta que escriba su DNI, RUC, celular ni correo/),
    ).toBeInTheDocument();
  });

  it('si se quitó un dato personal, lo avisa', async () => {
    simularApi({
      'POST /orientacion/preguntas': () => json(respuesta({ datoPersonalQuitado: true })),
    });
    const usuario = montar();

    await escribirYEnviar(usuario, 'mi DNI es 40000001, ¿cuánto cuesta?');

    expect(
      await screen.findByText(
        'Por su seguridad, quitamos sus datos personales de la pregunta. No hace falta escribirlos aquí.',
      ),
    ).toBeInTheDocument();
  });

  it('sin datos personales no muestra el aviso', async () => {
    simularApi({ 'POST /orientacion/preguntas': () => json(respuesta()) });
    const usuario = montar();

    await escribirYEnviar(usuario, '¿cuánto cuesta?');

    await screen.findByText('La licencia de riesgo medio cuesta S/ 177.10.');
    expect(screen.queryByText(/Por su seguridad/)).not.toBeInTheDocument();
  });

  it('con CONSULTA_TRAMITE el enlace "Consultar mi trámite" va a /consulta', async () => {
    simularApi({
      'POST /orientacion/preguntas': () =>
        json(
          respuesta({
            resultado: 'CONSULTA_TRAMITE',
            texto:
              "Para ver el estado de su trámite use 'Consultar mi trámite' con su número de expediente y su DNI o RUC. Por aquí no puedo ver expedientes.",
            enlaces: [{ tipo: 'CONSULTA' }],
            aclaracion: null,
          }),
        ),
    });
    const usuario = montar();

    await escribirYEnviar(usuario, '¿cómo va mi trámite?');

    expect(await screen.findByRole('link', { name: 'Consultar mi trámite' })).toHaveAttribute(
      'href',
      '/consulta',
    );
  });
});

describe('ChatOrientacion: conversación real (corrección de la 012, FR-027)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('el historial incluye los códigos de receta de las fichas de cada respuesta', async () => {
    const llamadas = simularApi({ 'POST /orientacion/preguntas': () => json(respuesta()) });
    const usuario = montar([
      { id: 1, autor: 'PERSONA', texto: 'par ala categoria mas basica' },
      {
        id: 2,
        autor: 'ORIENTADOR',
        texto: 'La más básica es la de riesgo bajo.',
        enlaces: [{ tipo: 'FICHA', codigoReceta: 'LIC-01' }, { tipo: 'ASISTENTE' }],
      },
    ]);

    await escribirYEnviar(usuario, 'cuales son esos documento requeridos');

    await waitFor(() => {
      expect(llamadas).toHaveLength(1);
    });
    expect(llamadas[0]?.cuerpo).toEqual({
      pregunta: 'cuales son esos documento requeridos',
      historial: [
        { rol: 'PERSONA', texto: 'par ala categoria mas basica' },
        {
          rol: 'ORIENTADOR',
          texto: 'La más básica es la de riesgo bajo.',
          codigosReceta: ['LIC-01'],
        },
      ],
    });
  });
});

describe('ChatOrientacion: el chat sigue útil aunque el proveedor falle (US4)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const NO_DISPONIBLE =
    "En este momento no puedo responder preguntas. Puede usar el asistente '¿Qué licencia necesito?' o ver la lista de licencias.";

  const esperarNoDisponible = async () => {
    expect(await screen.findByText(NO_DISPONIBLE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '¿Qué licencia necesito?' })).toHaveAttribute(
      'href',
      '/asistente',
    );
    expect(screen.getByRole('link', { name: 'Ver la lista de licencias' })).toHaveAttribute(
      'href',
      '/',
    );
  };

  it('NO_DISPONIBLE del servidor muestra el texto y los enlaces', async () => {
    simularApi({
      'POST /orientacion/preguntas': () =>
        json(
          respuesta({
            resultado: 'NO_DISPONIBLE',
            texto: NO_DISPONIBLE,
            enlaces: [{ tipo: 'ASISTENTE' }, { tipo: 'LICENCIAS' }],
            aclaracion: null,
          }),
        ),
    });
    const usuario = montar();

    await escribirYEnviar(usuario, '¿Cuánto cuesta?');

    await esperarNoDisponible();
  });

  it.each([
    ['una ruta que no existe (404)', {}],
    ['un 503', { 'POST /orientacion/preguntas': () => new Response(null, { status: 503 }) }],
    [
      'un error de red',
      { 'POST /orientacion/preguntas': () => Promise.reject(new TypeError('sin red')) },
    ],
  ])('con %s muestra el mismo mensaje y los mismos enlaces', async (_caso, manejadores) => {
    simularApi(manejadores);
    const usuario = montar();

    await escribirYEnviar(usuario, '¿Cuánto cuesta?');

    await esperarNoDisponible();
  });
});
