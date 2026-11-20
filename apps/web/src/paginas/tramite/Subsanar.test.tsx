import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, simularApi, type Manejador } from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { baseTramite, DESAFIO_PRUEBA } from '../../pruebas/tramite-prueba';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

// Datos FICTICIOS con la forma del contrato (EstadoPublico y ExpedienteRegistrado de la 005).
const OBSERVADO = {
  numero: 'EXP-2026-000123',
  estado: 'OBSERVADO',
  descripcionEstado: 'Tu solicitud tiene observaciones',
  siguientePaso: 'Subsana las observaciones dentro del plazo indicado',
  ruta: 'A',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  presentadoEn: '2026-11-19T15:00:00.000Z',
  vencePlazoEn: null,
  historial: [],
  observacionesPendientes: ['Falta el croquis de ubicación'],
  requisitosSubsanables: [{ id: 13, descripcion: 'Croquis de ubicación' }],
};

const DOCUMENTO_ID = '00000000-0000-4000-8000-000000000d01';

/** Entra por la consulta: "Subsanar" → identidad → código → página de subsanación. */
const llegarASubsanar = async (manejadores: Record<string, Manejador> = {}) => {
  const llamadas = simularApi({
    ...baseTramite,
    'POST /expedientes/consultar': () => json(OBSERVADO),
    'POST /identidad/verificar': () => json(DESAFIO_PRUEBA),
    'POST /identidad/verificar-otp': () => json({ token: 'token-identidad', expiraEn: 1800 }),
    'POST /documentos': () => json({ documentoId: DOCUMENTO_ID, sha256: 'a'.repeat(64) }, 201),
    ...manejadores,
  });
  montarEn('/consulta');
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Número de expediente'), 'EXP-2026-000123');
  await usuario.type(
    screen.getByLabelText('DNI, carné de extranjería o RUC del titular'),
    '40000001',
  );
  await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
  await usuario.click(await screen.findByRole('link', { name: 'Subsanar' }));

  expect(await screen.findByText('EXP-2026-000123')).toBeInTheDocument();
  await usuario.type(screen.getByLabelText('Número de documento'), '40000001');
  await usuario.type(screen.getByLabelText('Fecha de emisión del DNI'), '2020-01-15');
  await usuario.type(screen.getByLabelText('RUC'), '10400000011');
  await usuario.type(screen.getByLabelText('Celular', { exact: false }), '987000001');
  await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
  await usuario.type(await screen.findByLabelText('Código de verificación'), '123456');
  await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));
  await screen.findByText('Falta el croquis de ubicación');
  return { llamadas, usuario };
};

const archivo = () => new File(['%PDF-1.4'], 'croquis.pdf', { type: 'application/pdf' });

describe('Página Subsanar (005)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('el titular adjunta el documento y el expediente vuelve a evaluación', async () => {
    const { llamadas, usuario } = await llegarASubsanar({
      'POST /expedientes/EXP-2026-000123/subsanar': () =>
        json({
          numero: 'EXP-2026-000123',
          estado: 'EN_EVALUACION',
          ruta: 'A',
          codigoReceta: 'LIC-02',
          nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
          canal: 'EN_LINEA',
          presentadoEn: '2026-11-19T15:00:00.000Z',
          vencePlazoEn: null,
          siguientePaso: 'La municipalidad está revisando tus documentos',
        }),
    });

    await usuario.upload(screen.getByLabelText('Croquis de ubicación'), archivo());
    expect(await screen.findByText('Adjuntado: croquis.pdf')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Enviar subsanación' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Listo: tu expediente volvió a evaluación.',
    );
    const envio = llamadas.find((l) => l.clave.endsWith('/subsanar'));
    expect(envio?.autorizacion).toBe('Bearer token-identidad');
    expect(envio?.cuerpo).toMatchObject({
      documentos: [{ requisitoId: 13, documentoId: DOCUMENTO_ID }],
    });
    expect(llamadas.every((l) => !l.clave.includes('40000001'))).toBe(true);
  });

  it('sin documentos no envía nada', async () => {
    const { llamadas, usuario } = await llegarASubsanar();

    await usuario.click(screen.getByRole('button', { name: 'Enviar subsanación' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Adjunta al menos un documento.');
    expect(llamadas.some((l) => l.clave.endsWith('/subsanar'))).toBe(false);
  });

  it('si la identidad no es la del titular, lo dice', async () => {
    const { usuario } = await llegarASubsanar({
      'POST /expedientes/EXP-2026-000123/subsanar': () => problema(403, 'sin-permiso'),
    });

    await usuario.upload(screen.getByLabelText('Croquis de ubicación'), archivo());
    await screen.findByText('Adjuntado: croquis.pdf');
    await usuario.click(screen.getByRole('button', { name: 'Enviar subsanación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo el titular del expediente puede subsanarlo.',
    );
  });

  it('sin identidad confirmada lleva a confirmarla', async () => {
    simularApi(baseTramite);
    montarEn('/tramite/subsanar/EXP-2026-000123');

    expect(
      await screen.findByRole('heading', { name: 'Subsanar la observación', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Paso 1 de 2: tus datos' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Licencia que solicitas')).not.toBeInTheDocument();
  });
});
