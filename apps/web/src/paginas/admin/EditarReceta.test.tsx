import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecetaAdmin } from '../../servicios/clienteApi';
import {
  json,
  problema,
  sesionDePrueba,
  simularApi,
  type LlamadaRegistrada,
  type Manejador,
} from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

// Receta de ejemplo con la forma del contrato (ruta A).
const receta = (cambios: Partial<RecetaAdmin> = {}): RecetaAdmin => ({
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
  activa: true,
  actualizadaEn: '2026-11-18T10:00:00.000Z',
  requisitos: [
    { id: 11, orden: 1, descripcion: 'Solicitud', obligatorio: true, condicion: 'SIEMPRE' },
    {
      id: 12,
      orden: 2,
      descripcion: 'Carta poder',
      obligatorio: true,
      condicion: 'CON_REPRESENTANTE',
    },
    { id: 13, orden: 3, descripcion: 'Declaración', obligatorio: true, condicion: 'SIEMPRE' },
  ],
  ...cambios,
});

const tramite = (): RecetaAdmin =>
  receta({
    codigo: 'TRF-01',
    nombre: 'Transferencia de licencia',
    tipo: 'TRAMITE_CONECTADO',
    ruta: null,
    tasa: '45.10',
    plazoDias: null,
    nivelRiesgo: null,
    ordenItse: null,
    plazoItseDias: null,
    requisitos: [
      {
        id: 21,
        orden: 1,
        descripcion: 'Declaración jurada',
        obligatorio: true,
        condicion: 'SIEMPRE',
      },
    ],
  });

const RUTA_GET = 'GET /admin/catalogo/recetas/LIC-02';
const RUTA_PUT = 'PUT /catalogo/recetas/LIC-02';

const simular = (manejadores: Record<string, Manejador> = {}) =>
  simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['ADMINISTRADOR'] })),
    'GET /catalogo/recetas': () => json([]),
    [RUTA_GET]: () => json(receta()),
    [RUTA_PUT]: async (peticion) => json(receta((await peticion.json()) as Partial<RecetaAdmin>)),
    ...manejadores,
  });

const abrir = async (ruta = '/admin/catalogo/LIC-02') => {
  montarEn(ruta);
  await screen.findByRole('heading', { level: 1, name: /^Editar receta/ });
  return screen.findByLabelText('Tasa (S/)');
};

const escribir = async (etiqueta: string, texto: string) => {
  const campo = screen.getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (texto !== '') {
    await userEvent.type(campo, texto);
  }
};

const guardar = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
};

const cuerpoPut = (llamadas: LlamadaRegistrada[]) =>
  llamadas.filter((llamada) => llamada.clave === RUTA_PUT).map((llamada) => llamada.cuerpo);

describe('Edición de una receta (/admin/catalogo/:codigo)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
    sessionStorage.clear();
  });

  it('muestra en solo lectura el código, nombre, tipo, ruta y código del TUPA', async () => {
    simular();
    await abrir();

    const datos = within(screen.getByLabelText('Datos que no se editan'));
    expect(datos.getByText('Licencia de funcionamiento – riesgo medio')).toBeInTheDocument();
    expect(datos.getByText('Licencia')).toBeInTheDocument();
    expect(datos.getByText('A')).toBeInTheDocument();
    expect(datos.getByText('PE102730761 (pág. 370)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  });

  it('en la ruta A solo ofrece la calificación y el orden del ITSE válidos', async () => {
    simular();
    await abrir();

    expect(
      within(screen.getByLabelText('Calificación'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Aprobación automática']);
    expect(
      within(screen.getByLabelText('Orden del ITSE'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Posterior a la licencia']);
  });

  it('en un trámite conectado no muestra ITSE ni vigencia y ofrece sus 2 calificaciones', async () => {
    simular({ 'GET /admin/catalogo/recetas/TRF-01': () => json(tramite()) });
    await abrir('/admin/catalogo/TRF-01');

    expect(screen.queryByLabelText('Orden del ITSE')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Plazo del ITSE (días hábiles)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Vigencia (meses)')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Calificación')).getAllByRole('option')).toHaveLength(2);
  });

  it.each([
    ['180', '180.00'],
    ['180.5', '180.50'],
    ['180.00', '180.00'],
  ])('normaliza la tasa %s a %s antes de enviarla', async (texto, enviada) => {
    const llamadas = simular();
    await abrir();

    await escribir('Tasa (S/)', texto);
    await guardar();

    expect(
      await screen.findByText(
        'Cambios guardados. El catálogo público se actualiza en 5 minutos como máximo.',
      ),
    ).toBeInTheDocument();
    expect(cuerpoPut(llamadas)).toEqual([{ tasa: enviada }]);
  });

  it.each(['abc', '180.555', '-5'])(
    'marca la tasa %s en el campo sin llamar a la API',
    async (texto) => {
      const llamadas = simular();
      await abrir();

      await escribir('Tasa (S/)', texto);
      await guardar();

      const campo = screen.getByLabelText('Tasa (S/)');
      expect(campo).toHaveAttribute('aria-invalid', 'true');
      expect(campo).toHaveAccessibleDescription(/2 decimales como máximo/);
      expect(cuerpoPut(llamadas)).toEqual([]);
    },
  );

  it('sin cambios (comparando la tasa ya normalizada) avisa sin llamar a la API', async () => {
    const llamadas = simular();
    await abrir();

    await escribir('Tasa (S/)', '177.1');
    await guardar();

    expect(await screen.findByText('No hay cambios para guardar.')).toBeInTheDocument();
    expect(cuerpoPut(llamadas)).toEqual([]);
  });

  it('agrega, sube, baja y quita requisitos, y envía el id de los existentes', async () => {
    const llamadas = simular();
    await abrir();

    await userEvent.click(screen.getByRole('button', { name: 'Subir el requisito 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bajar el requisito 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el requisito 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar requisito' }));
    await userEvent.type(screen.getByLabelText('Requisito 3'), 'Conformidad de zonificación');
    await userEvent.click(screen.getByLabelText('Requisito 3 obligatorio'));
    await userEvent.selectOptions(
      screen.getByLabelText('Condición del requisito 3'),
      'Solo si el giro lo exige',
    );
    await guardar();

    await screen.findByText(/Cambios guardados/);
    expect(cuerpoPut(llamadas)).toEqual([
      {
        requisitos: [
          // [11, 12, 13] → subir el 3.º → [11, 13, 12] → bajar el 1.º → [13, 11, 12] → quitar el 3.º
          { id: 13, descripcion: 'Declaración', obligatorio: true, condicion: 'SIEMPRE' },
          { id: 11, descripcion: 'Solicitud', obligatorio: true, condicion: 'SIEMPRE' },
          {
            descripcion: 'Conformidad de zonificación',
            obligatorio: false,
            condicion: 'GIRO_ESPECIAL',
          },
        ],
      },
    ]);
  });

  it('el texto del requisito admite como máximo 500 caracteres', async () => {
    simular();
    await abrir();

    expect(screen.getByLabelText('Requisito 1')).toHaveAttribute('maxLength', '500');
  });

  it('los 422 se muestran junto a cada campo y en un resumen que recibe el foco', async () => {
    simular({
      [RUTA_PUT]: () =>
        json(
          {
            type: 'https://licencias.example.pe/errores/validacion',
            title: 'Los datos no cumplen las reglas de validación',
            status: 422,
            errores: [
              { campo: 'plazoItseDias', mensaje: 'Debe ser un entero mayor o igual a 1' },
              { campo: 'requisitos[1].descripcion', mensaje: 'No puede estar vacía' },
            ],
          },
          422,
        ),
    });
    await abrir();

    await escribir('Plazo del ITSE (días hábiles)', '99');
    await guardar();

    const resumen = await screen.findByRole('alert');
    await waitFor(() => {
      expect(resumen).toHaveFocus();
    });
    expect(resumen).toHaveTextContent('Plazo del ITSE: Debe ser un entero mayor o igual a 1');
    expect(resumen).toHaveTextContent('Requisito 2 (descripción): No puede estar vacía');
    expect(screen.getByLabelText('Plazo del ITSE (días hábiles)')).toHaveAccessibleDescription(
      'Debe ser un entero mayor o igual a 1',
    );
    expect(screen.getByLabelText('Requisito 2')).toHaveAccessibleDescription(
      'No puede estar vacía',
    );
  });

  it('con un 403 muestra un aviso de permiso', async () => {
    simular({ [RUTA_PUT]: () => problema(403, 'sin-permiso') });
    await abrir();

    await escribir('Tasa (S/)', '200');
    await guardar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes permiso para editar el catálogo.',
    );
  });

  it('con un 401 lleva a /ingresar y, al volver, restaura lo escrito para reintentar', async () => {
    let vencida = true;
    const llamadas = simular({
      [RUTA_PUT]: async (peticion) =>
        vencida
          ? problema(401, 'no-autenticado')
          : json(receta((await peticion.json()) as Partial<RecetaAdmin>)),
      'POST /auth/renovar': () =>
        llamadas.some((llamada) => llamada.clave === RUTA_PUT)
          ? problema(401, 'no-autenticado')
          : json(sesionDePrueba({ roles: ['ADMINISTRADOR'] })),
    });
    await abrir();

    await escribir('Tasa (S/)', '199.9');
    await guardar();

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(sessionStorage.getItem('catalogo:borrador:LIC-02')).toContain('199.9');
    expect(sessionStorage.getItem('catalogo:borrador:LIC-02')).not.toMatch(/@/);

    // La persona vuelve a ingresar (otra pestaña o el flujo de ingreso) y regresa a la receta.
    cleanup();
    jest.restoreAllMocks();
    reiniciarSesion();
    vencida = false;
    const nuevas = simular();
    await abrir();

    expect(screen.getByLabelText('Tasa (S/)')).toHaveValue('199.9');
    expect(screen.getByRole('status')).toHaveTextContent('Recuperamos los cambios');
    await guardar();
    await screen.findByText(/Cambios guardados/);
    expect(cuerpoPut(nuevas)).toEqual([{ tasa: '199.90' }]);
    expect(sessionStorage.getItem('catalogo:borrador:LIC-02')).toBeNull();
  });

  it('el interruptor "Activa" explica su efecto y desactivar envía solo activa=false', async () => {
    const llamadas = simular();
    await abrir();

    const activa = screen.getByRole('checkbox', { name: 'Activa' });
    expect(activa).toBeChecked();
    expect(activa).toHaveAccessibleDescription(
      'Si la desactivas, no se mostrará al público ni la propondrá el asistente.',
    );
    await userEvent.click(activa);
    await guardar();

    await screen.findByText(/Cambios guardados/);
    expect(cuerpoPut(llamadas)).toEqual([{ activa: false }]);
    expect(screen.getByRole('checkbox', { name: 'Activa' })).not.toBeChecked();
  });

  it('una receta desactivada se muestra sin marcar y se puede reactivar', async () => {
    const llamadas = simular({ [RUTA_GET]: () => json(receta({ activa: false })) });
    await abrir();

    const activa = screen.getByRole('checkbox', { name: 'Activa' });
    expect(activa).not.toBeChecked();
    await userEvent.click(activa);
    await guardar();

    await screen.findByText(/Cambios guardados/);
    expect(cuerpoPut(llamadas)).toEqual([{ activa: true }]);
  });

  it('volver a marcar "Activa" sin guardar no cuenta como cambio', async () => {
    const llamadas = simular();
    await abrir();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Activa' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Activa' }));
    await guardar();

    expect(await screen.findByText('No hay cambios para guardar.')).toBeInTheDocument();
    expect(cuerpoPut(llamadas)).toEqual([]);
  });

  it('si la receta no se puede cargar permite reintentar', async () => {
    let intentos = 0;
    simular({
      [RUTA_GET]: () => {
        intentos += 1;
        return intentos === 1 ? new Response(null, { status: 503 }) : json(receta());
      },
    });
    montarEn('/admin/catalogo/LIC-02');

    const alerta = await screen.findByRole('alert');
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByLabelText('Tasa (S/)')).toHaveValue('177.10');
  });
});
