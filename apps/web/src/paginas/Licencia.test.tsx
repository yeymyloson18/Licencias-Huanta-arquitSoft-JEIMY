import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Receta } from '../servicios/clienteApi';
import { json, problema, simularApi, type Manejador } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';
import { reiniciarSesion } from '../sesion/almacen-sesion';

// Receta de ejemplo con la forma del contrato: los números y requisitos vienen de la API (FR-012).
const receta: Receta = {
  codigo: 'LIC-03',
  nombre: 'Licencia de funcionamiento – riesgo alto',
  tipo: 'LICENCIA',
  ruta: 'B',
  tasa: '305.90',
  plazoDias: 8,
  codigoTupa: 'PE102735B77',
  paginaTupa: 372,
  nivelRiesgo: 'ALTO',
  tipoPlazo: 'HABILES',
  calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
  ordenItse: 'PREVIA',
  plazoItseDias: 7,
  vigenciaMeses: null,
  requisitos: [
    {
      id: 10,
      orden: 1,
      descripcion: 'Solicitud con declaración jurada',
      obligatorio: true,
      condicion: 'SIEMPRE',
    },
    {
      id: 11,
      orden: 2,
      descripcion: 'Croquis de ubicación',
      obligatorio: true,
      condicion: 'SIEMPRE',
    },
  ],
};

const simular = (manejadores: Record<string, Manejador> = {}) =>
  simularApi({
    'POST /auth/renovar': () => problema(401, 'no-autenticado'),
    'GET /catalogo/recetas/LIC-03': () => json(receta),
    ...manejadores,
  });

describe('Ficha pública de una licencia (/licencias/:codigo)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('pide la ficha del código de la URL y la muestra con sus requisitos en orden', async () => {
    const llamadas = simular();
    montarEn('/licencias/LIC-03');

    const ficha = await screen.findByRole('article', {
      name: 'Licencia de funcionamiento – riesgo alto',
    });
    expect(within(ficha).getByText('S/ 305.90')).toBeInTheDocument();
    expect(within(ficha).getByText('Previa, hasta 7 días hábiles')).toBeInTheDocument();
    const requisitos = within(ficha).getAllByRole('listitem');
    expect(requisitos.map((requisito) => requisito.textContent)).toEqual([
      'Solicitud con declaración jurada',
      'Croquis de ubicación',
    ]);
    expect(llamadas.map((llamada) => llamada.clave)).toContain('GET /catalogo/recetas/LIC-03');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Detalle de la licencia');
  });

  it('muestra "Cargando la licencia…" mientras espera', async () => {
    let responder: (respuesta: Response) => void = () => undefined;
    simular({
      'GET /catalogo/recetas/LIC-03': () =>
        new Promise<Response>((resolver) => {
          responder = resolver;
        }),
    });
    montarEn('/licencias/LIC-03');

    expect(await screen.findByText('Cargando la licencia…')).toBeInTheDocument();
    responder(json(receta));
    expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(screen.queryByText('Cargando la licencia…')).not.toBeInTheDocument();
  });

  it.each([
    ['desactivada o inexistente (404)', 'LIC-06', () => problema(404, 'no-encontrado')],
    ['con un código que no es del TUPA (422)', 'XYZ-01', () => problema(422, 'validacion')],
  ])(
    'si la licencia está %s dice que no está disponible y enlaza al catálogo',
    async (_, codigo, respuesta) => {
      simular({ [`GET /catalogo/recetas/${codigo}`]: respuesta });
      montarEn(`/licencias/${codigo}`);

      expect(
        await screen.findByRole('heading', { name: 'Esta licencia no está disponible' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver al catálogo de licencias' })).toHaveAttribute(
        'href',
        '/',
      );
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('si el servicio no está disponible muestra un aviso sin detalles técnicos y permite reintentar', async () => {
    let intentos = 0;
    simular({
      'GET /catalogo/recetas/LIC-03': () => {
        intentos += 1;
        return intentos === 1 ? new Response(null, { status: 503 }) : json(receta);
      },
    });
    montarEn('/licencias/LIC-03');

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('La licencia no se pudo cargar en este momento');
    expect(alerta).not.toHaveTextContent(/503/);
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(intentos).toBe(2);
  });
});
