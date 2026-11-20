import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, simularApi, type Manejador } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';
import { reiniciarSesion } from '../sesion/almacen-sesion';

// Datos FICTICIOS con la forma del contrato (EstadoPublico).
const ESTADO = {
  numero: 'EXP-2026-000123',
  estado: 'EN_EVALUACION',
  descripcionEstado: 'Tu solicitud está en evaluación',
  siguientePaso: 'La municipalidad está revisando tus documentos',
  ruta: 'A',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  presentadoEn: '2026-11-19T15:00:00.000Z',
  vencePlazoEn: null,
  historial: [
    {
      estado: 'REGISTRADO',
      descripcion: 'Tu solicitud fue registrada y espera evaluación',
      ocurridoEn: '2026-11-19T15:00:00.000Z',
    },
    {
      estado: 'EN_EVALUACION',
      descripcion: 'Tu solicitud está en evaluación',
      ocurridoEn: '2026-11-20T15:00:00.000Z',
    },
  ],
};

const base: Record<string, Manejador> = {
  'POST /auth/renovar': () => problema(401, 'no-autenticado'),
};

const consultar = async (
  manejador: Manejador,
  numero = 'exp-2026-000123',
  documento = '40000001',
) => {
  const llamadas = simularApi({ ...base, 'POST /expedientes/consultar': manejador });
  montarEn('/consulta');
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Número de expediente'), numero);
  await usuario.type(
    screen.getByLabelText('DNI, carné de extranjería o RUC del titular'),
    documento,
  );
  await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
  return { llamadas, usuario };
};

describe('Página Consulta', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  describe('esquela y observaciones (005)', () => {
    const PENDIENTE = {
      ...ESTADO,
      estado: 'PENDIENTE_PAGO',
      descripcionEstado: 'Tu solicitud espera el pago',
      siguientePaso: 'Paga la esquela en la caja municipal',
      codigoEsquela: 'ESQ-EXP-2026-000123',
      montoEsquela: '177.10',
      esquelaPagada: false,
      tokenConsulta: { token: 'token-consulta-ficticio', expiraEn: 900 },
    };
    const consultarPendiente = async (pdf: Manejador) => {
      const llamadas = simularApi({
        ...base,
        'POST /expedientes/consultar': () => json(PENDIENTE),
        'GET /esquelas/ESQ-EXP-2026-000123/pdf': pdf,
      });
      montarEn('/consulta');
      const usuario = userEvent.setup();
      await usuario.type(await screen.findByLabelText('Número de expediente'), 'EXP-2026-000123');
      await usuario.type(
        screen.getByLabelText('DNI, carné de extranjería o RUC del titular'),
        '40000001',
      );
      await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
      return { llamadas, usuario };
    };

    beforeEach(() => {
      Object.assign(URL, {
        createObjectURL: jest.fn(() => 'blob:ficticio'),
        revokeObjectURL: jest.fn(),
      });
    });

    it('muestra el código y el monto, y descarga el PDF con el token de consulta', async () => {
      const clic = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const { llamadas, usuario } = await consultarPendiente(
        () =>
          new Response(new Blob(['%PDF-1.7']), { headers: { 'Content-Type': 'application/pdf' } }),
      );

      expect(await screen.findByText('ESQ-EXP-2026-000123')).toBeInTheDocument();
      expect(screen.getByText('S/ 177.10')).toBeInTheDocument();
      await usuario.click(screen.getByRole('button', { name: 'Descargar esquela' }));

      await waitFor(() => {
        expect(clic).toHaveBeenCalled();
      });
      expect(llamadas.find((l) => l.clave.endsWith('/pdf'))?.autorizacion).toBe(
        'Bearer token-consulta-ficticio',
      );
    });

    it('si la esquela aún se genera, avisa que vuelva a intentar', async () => {
      const { usuario } = await consultarPendiente(() => new Response(null, { status: 202 }));

      await usuario.click(await screen.findByRole('button', { name: 'Descargar esquela' }));

      expect(await screen.findByRole('status')).toHaveTextContent(
        'La esquela se está generando. Vuelve a intentarlo en unos segundos.',
      );
    });

    it('un expediente observado muestra el texto de la observación y no ofrece descarga', async () => {
      await consultar(() =>
        json({
          ...ESTADO,
          estado: 'OBSERVADO',
          observacionesPendientes: ['Falta el croquis de ubicación'],
        }),
      );

      expect(await screen.findByText('Falta el croquis de ubicación')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Descargar esquela' })).not.toBeInTheDocument();
    });
  });

  it('envía los datos por POST, sin ponerlos en la URL, y muestra el estado con su historial', async () => {
    const { llamadas } = await consultar(() => json(ESTADO));

    const titulo = await screen.findByRole('heading', { name: 'EXP-2026-000123' });
    await waitFor(() => {
      expect(titulo).toHaveFocus();
    });
    expect(
      screen.getByText('Tu solicitud está en evaluación', { selector: 'dd' }),
    ).toBeInTheDocument();
    // El texto de la API no trae punto final: la página lo agrega.
    expect(screen.getByText('La municipalidad está revisando tus documentos.')).toBeInTheDocument();
    const historial = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(historial.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Tu solicitud fue registrada y espera evaluación/),
      expect.stringMatching(/^Tu solicitud está en evaluación/),
    ]);
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(llamadas.find((l) => l.clave === 'POST /expedientes/consultar')?.cuerpo).toEqual({
      numeroExpediente: 'exp-2026-000123',
      documento: '40000001',
    });
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('40000001');
  });

  it('con datos que no coinciden muestra un mensaje único', async () => {
    await consultar(() => problema(404, 'no-encontrado'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No encontramos un trámite con esos datos. Revisa el número de expediente y el documento.',
    );
  });

  it('con demasiados intentos muestra la hora para reintentar', async () => {
    await consultar(() => problema(429, 'demasiados-intentos', { 'Retry-After': '900' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Puedes volver a intentarlo a las \d{2}:\d{2}/,
    );
  });

  it('un formato inválido se marca en su campo', async () => {
    await consultar(
      () =>
        json(
          {
            status: 422,
            errores: [
              { campo: 'numeroExpediente', mensaje: 'Debe tener el formato EXP-AAAA-NNNNNN' },
            ],
          },
          422,
        ),
      'EXP-1',
    );

    expect(await screen.findByText('Debe tener el formato EXP-AAAA-NNNNNN')).toBeInTheDocument();
    expect(screen.getByLabelText('Número de expediente', { exact: false })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('si el servicio no responde lo dice sin detalles técnicos', async () => {
    await consultar(() => problema(503, 'servicio-no-disponible'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/);
  });

  it('sin datos marca los campos y no consulta', async () => {
    const llamadas = simularApi(base);
    montarEn('/consulta');
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Consultar' }));

    expect(screen.getByText('Escribe el número de expediente')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu DNI, carné de extranjería o RUC')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave === 'POST /expedientes/consultar')).toBe(false);
  });

  it('mientras consulta desactiva el botón', async () => {
    let soltar: (respuesta: Response) => void = () => undefined;
    await consultar(
      () =>
        new Promise<Response>((resolver) => {
          soltar = resolver;
        }),
    );

    expect(await screen.findByRole('button', { name: 'Consultando…' })).toBeDisabled();
    soltar(json(ESTADO));
    expect(await screen.findByRole('heading', { name: 'EXP-2026-000123' })).toBeInTheDocument();
  });
});
