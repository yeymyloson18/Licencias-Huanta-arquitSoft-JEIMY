import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { components } from '@licencias/contracts';
import { MemoryRouter } from 'react-router';
import { Inicio } from './Inicio';

type RecetaResumen = components['schemas']['RecetaResumen'];

// Datos de prueba con la forma del contrato (contracts/portal-inicio.md).
const nueveLicencias: RecetaResumen[] = Array.from({ length: 9 }, (_, indice) => ({
  codigo: `LIC-0${String(indice + 1)}`,
  nombre: `Licencia de prueba ${String(indice + 1)}`,
  tipo: 'LICENCIA',
  ruta: 'A',
  tasa: indice === 0 ? '159.50' : `${String(100 + indice)}.00`,
  plazoDias: indice === 0 ? 2 : 8,
}));

const respuestaJson = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const urlDeLlamada = (llamada: unknown[]): string => {
  const [entrada] = llamada;
  return entrada instanceof Request ? entrada.url : String(entrada);
};

describe('Página de inicio del catálogo', () => {
  let fetchSimulado: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSimulado = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('pide solo las licencias al backend', async () => {
    fetchSimulado.mockResolvedValue(respuestaJson(nueveLicencias));

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    await screen.findAllByRole('listitem');
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(urlDeLlamada(fetchSimulado.mock.calls[0] ?? [])).toMatch(
      /\/api\/v1\/catalogo\/recetas\?tipo=LICENCIA$/,
    );
  });

  it('ofrece el asistente de ruta con el botón "¿Qué licencia necesito?" (003)', async () => {
    fetchSimulado.mockResolvedValue(respuestaJson(nueveLicencias));

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    await screen.findAllByRole('listitem');
    expect(screen.getByRole('link', { name: '¿Qué licencia necesito?' })).toHaveAttribute(
      'href',
      '/asistente',
    );
  });

  it('ofrece "Consultar mi trámite" (004)', async () => {
    fetchSimulado.mockResolvedValue(respuestaJson(nueveLicencias));

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    await screen.findAllByRole('listitem');
    expect(screen.getByRole('link', { name: 'Consultar mi trámite' })).toHaveAttribute(
      'href',
      '/consulta',
    );
  });

  it('muestra "Cargando licencias…" mientras espera la respuesta', async () => {
    let responder: (respuesta: Response) => void = () => undefined;
    fetchSimulado.mockReturnValue(
      new Promise<Response>((resolver) => {
        responder = resolver;
      }),
    );

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Cargando licencias…');
    responder(respuestaJson(nueveLicencias));
    await screen.findAllByRole('listitem');
    expect(screen.queryByText('Cargando licencias…')).not.toBeInTheDocument();
  });

  it('lista las 9 licencias con nombre, tasa en soles y plazo', async () => {
    fetchSimulado.mockResolvedValue(respuestaJson(nueveLicencias));

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    const elementos = await screen.findAllByRole('listitem');
    expect(elementos).toHaveLength(9);
    const primera = within(elementos[0] as HTMLElement);
    expect(primera.getByRole('heading', { name: 'Licencia de prueba 1' })).toBeInTheDocument();
    expect(primera.getByText('S/ 159.50')).toBeInTheDocument();
    expect(primera.getByText('2 días hábiles')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('cada tarjeta enlaza a la ficha de su licencia sin perder la lista (003)', async () => {
    fetchSimulado.mockResolvedValue(respuestaJson(nueveLicencias));

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    const lista = await screen.findByRole('list', { name: 'Licencias de funcionamiento' });
    const elementos = within(lista).getAllByRole('listitem');
    expect(elementos).toHaveLength(9);
    expect(
      within(elementos[0] as HTMLElement).getByRole('link', { name: 'Licencia de prueba 1' }),
    ).toHaveAttribute('href', '/licencias/LIC-01');
    expect(within(lista).getAllByRole('link')).toHaveLength(9);
  });

  it('muestra un mensaje claro si el catálogo llega vacío', async () => {
    fetchSimulado.mockResolvedValue(respuestaJson([]));

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        'Por ahora no hay licencias publicadas en el catálogo. Vuelva a intentarlo más tarde.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it.each([
    ['un error de red', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['una respuesta 500', () => Promise.resolve(respuestaJson({ status: 500 }, 500))],
    ['una respuesta 503', () => Promise.resolve(respuestaJson({ status: 503 }, 503))],
  ])('ante %s muestra que el catálogo no está disponible', async (_, respuesta) => {
    fetchSimulado.mockImplementation(respuesta);

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(
      'El catálogo no está disponible en este momento. Vuelva a intentarlo en unos minutos.',
    );
    expect(alerta).not.toHaveTextContent(/500|503|Failed|fetch/);
  });

  it('el botón "Reintentar" vuelve a pedir el catálogo', async () => {
    fetchSimulado
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(respuestaJson(nueveLicencias));

    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findAllByRole('listitem')).toHaveLength(9);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
