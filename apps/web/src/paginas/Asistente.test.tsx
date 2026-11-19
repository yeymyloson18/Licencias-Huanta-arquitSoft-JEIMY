import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PreguntaAsistente, Receta } from '../servicios/clienteApi';
import { json, problema, simularApi, type Manejador } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';
import { reiniciarSesion } from '../sesion/almacen-sesion';

// Preguntas y receta de ejemplo con la forma del contrato: el portal no conoce las preguntas reales,
// las recibe de la API (FR-002).
const preguntasDePrueba = (cantidad = 3): PreguntaAsistente[] =>
  Array.from({ length: cantidad }, (_, indice) => ({
    codigo: `P${String(indice + 1)}`,
    orden: indice + 1,
    texto: `¿Pregunta número ${String(indice + 1)}?`,
    opciones: [
      { valor: 'A', texto: `Opción A de la ${String(indice + 1)}` },
      { valor: 'B', texto: `Opción B de la ${String(indice + 1)}` },
    ],
  }));

const receta: Receta = {
  codigo: 'LIC-02',
  nombre: 'Licencia de funcionamiento – riesgo medio',
  tipo: 'LICENCIA',
  ruta: 'A',
  tasa: '177.10',
  plazoDias: 2,
  codigoTupa: 'PE102730761',
  paginaTupa: 370,
  nivelRiesgo: 'MEDIO',
  tipoPlazo: 'HABILES',
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'POSTERIOR',
  plazoItseDias: 9,
  vigenciaMeses: null,
  requisitos: [
    {
      id: 1,
      orden: 1,
      descripcion: 'Solicitud con declaración jurada',
      obligatorio: true,
      condicion: 'SIEMPRE',
    },
  ],
};

const propuesta = () => json({ resultado: 'PROPUESTA', receta });
const noDeterminada = () => json({ resultado: 'NO_DETERMINADA', motivo: 'SIN_REGLA' });

const simular = (manejadores: Record<string, Manejador> = {}) =>
  simularApi({
    'POST /auth/renovar': () => problema(401, 'no-autenticado'),
    'GET /asistente/preguntas': () => json(preguntasDePrueba()),
    'POST /asistente/proponer': propuesta,
    ...manejadores,
  });

const elegir = async (texto: string) => {
  await userEvent.click(await screen.findByRole('radio', { name: texto }));
};
const siguiente = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
};
const responderTodas = async (cantidad = 3) => {
  for (let indice = 1; indice <= cantidad; indice += 1) {
    await elegir(`Opción A de la ${String(indice)}`);
    await siguiente();
  }
};

describe('Asistente de ruta (/asistente)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra solo la primera pregunta, con su avance y el foco en el título', async () => {
    simular();
    montarEn('/asistente');

    const titulo = await screen.findByRole('heading', { level: 1, name: '¿Pregunta número 1?' });
    expect(screen.getByText('Pregunta 1 de 3')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByText('¿Pregunta número 2?')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(titulo).toHaveFocus();
    });
  });

  it('agrupa las opciones en un grupo con nombre (fieldset y legend)', async () => {
    simular();
    montarEn('/asistente');

    expect(await screen.findByRole('group', { name: '¿Pregunta número 1?' })).toBeInTheDocument();
  });

  it('no deja avanzar sin elegir una opción', async () => {
    simular();
    montarEn('/asistente');

    await screen.findByText('¿Pregunta número 1?');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await elegir('Opción B de la 1');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('con las tres respuestas pide la propuesta y muestra la ficha con el aviso orientativo', async () => {
    const llamadas = simular();
    montarEn('/asistente');

    await responderTodas();

    expect(
      await screen.findByRole('heading', { name: 'Esta es la licencia que te corresponde' }),
    ).toBeInTheDocument();
    const ficha = screen.getByRole('article', {
      name: 'Licencia de funcionamiento – riesgo medio',
    });
    expect(within(ficha).getByRole('link', { name: 'Presentar solicitud' })).toHaveAttribute(
      'href',
      '/tramite/identidad?licencia=LIC-02',
    );
    expect(screen.getByText(/Esta propuesta es orientativa/)).toBeInTheDocument();
    const pedido = llamadas.find((llamada) => llamada.clave === 'POST /asistente/proponer');
    expect(pedido?.cuerpo).toEqual({ respuestas: { P1: 'A', P2: 'A', P3: 'A' } });
  });

  it('si no se puede determinar la licencia lo dice y sugiere acudir a la municipalidad', async () => {
    simular({ 'POST /asistente/proponer': noDeterminada });
    montarEn('/asistente');

    await responderTodas();

    expect(
      await screen.findByRole('heading', {
        name: 'No pudimos determinar tu licencia con tus respuestas',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Subgerencia de Comercio, Licencias y Control Sanitario/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('"Volver" regresa a la pregunta anterior con su respuesta marcada', async () => {
    simular();
    montarEn('/asistente');

    await elegir('Opción B de la 1');
    await siguiente();
    await screen.findByText('Pregunta 2 de 3');
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(await screen.findByText('Pregunta 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Opción B de la 1' })).toBeChecked();
  });

  it('"Volver" desde la propuesta permite cambiar la última respuesta', async () => {
    simular();
    montarEn('/asistente');

    await responderTodas();
    await screen.findByRole('article');
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(await screen.findByText('Pregunta 3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Opción A de la 3' })).toBeChecked();
  });

  it('"Empezar de nuevo" borra las respuestas y vuelve a la primera pregunta', async () => {
    simular();
    montarEn('/asistente');

    await responderTodas();
    await screen.findByRole('article');
    await userEvent.click(screen.getByRole('button', { name: 'Empezar de nuevo' }));

    expect(await screen.findByText('Pregunta 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Opción A de la 1' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Opción B de la 1' })).not.toBeChecked();
  });

  it('al recargar con respuestas en la URL sigue en la pregunta en la que estaba', async () => {
    simular();
    montarEn('/asistente?P1=A');

    expect(await screen.findByText('Pregunta 2 de 3')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: '¿Pregunta número 2?' }),
    ).toBeInTheDocument();
  });

  it('descarta respuestas inválidas o desconocidas de la URL', async () => {
    const llamadas = simular();
    montarEn('/asistente?P1=Z&P2=A&OTRA=1');

    expect(await screen.findByText('Pregunta 1 de 3')).toBeInTheDocument();
    expect(llamadas.some((llamada) => llamada.clave === 'POST /asistente/proponer')).toBe(false);
  });

  it('con la URL completa muestra directamente la propuesta', async () => {
    simular();
    montarEn('/asistente?P1=A&P2=B&P3=A');

    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it.each([2, 4])(
    'el avance usa el número de preguntas que da la API (%i), nunca un 3 fijo',
    async (cantidad) => {
      const llamadas = simular({
        'GET /asistente/preguntas': () => json(preguntasDePrueba(cantidad)),
      });
      montarEn('/asistente');

      expect(await screen.findByText(`Pregunta 1 de ${String(cantidad)}`)).toBeInTheDocument();
      await responderTodas(cantidad);

      await screen.findByRole('article');
      const pedido = llamadas.find((llamada) => llamada.clave === 'POST /asistente/proponer');
      expect(Object.keys((pedido?.cuerpo as { respuestas: object }).respuestas)).toHaveLength(
        cantidad,
      );
    },
  );

  it('si las preguntas no cargan, muestra un aviso sin detalles técnicos y permite reintentar', async () => {
    let intentos = 0;
    simular({
      'GET /asistente/preguntas': () => {
        intentos += 1;
        return intentos === 1 ? new Response(null, { status: 500 }) : json(preguntasDePrueba());
      },
    });
    montarEn('/asistente');

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('El asistente no está disponible en este momento');
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Pregunta 1 de 3')).toBeInTheDocument();
  });

  it('si la propuesta falla, permite reintentarla', async () => {
    let intentos = 0;
    simular({
      'POST /asistente/proponer': () => {
        intentos += 1;
        return intentos === 1 ? new Response(null, { status: 503 }) : propuesta();
      },
    });
    montarEn('/asistente');

    await responderTodas();
    const alerta = await screen.findByRole('alert');
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it('mientras busca la propuesta lo indica y desactiva los botones', async () => {
    let responder: (respuesta: Response) => void = () => undefined;
    simular({
      'POST /asistente/proponer': () =>
        new Promise<Response>((resolver) => {
          responder = resolver;
        }),
    });
    montarEn('/asistente');

    await responderTodas();

    expect(await screen.findByText('Buscando tu licencia…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empezar de nuevo' })).toBeDisabled();
    responder(propuesta());
    expect(await screen.findByRole('article')).toBeInTheDocument();
  });
});
