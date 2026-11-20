import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  json,
  problema,
  sesionDePrueba,
  simularApi,
  type Manejador,
} from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

// Datos FICTICIOS con la forma del contrato (Esquela de la 005).
const ESQUELA = {
  codigo: 'ESQ-EXP-2026-000010',
  numeroExpediente: 'EXP-2026-000010',
  concepto: 'Licencia de funcionamiento – riesgo medio',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  monto: '177.10',
  pagada: false,
  numeroRecibo: null,
  pagadaEn: null,
  generadaEn: '2026-11-20T15:00:00.000Z',
  estadoExpediente: 'PENDIENTE_PAGO',
};

const montar = (manejadores: Record<string, Manejador>, roles = ['CAJA']) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    'GET /esquelas/ESQ-EXP-2026-000010': () => json(ESQUELA),
    'GET /expedientes/EXP-2026-000010/titular': () =>
      json({
        numeroExpediente: 'EXP-2026-000010',
        nombreTitular: 'Titular de Prueba',
        razonSocial: null,
      }),
    ...manejadores,
  });
  montarEn('/personal/caja');
  return { llamadas, usuario: userEvent.setup() };
};

const buscar = async (
  usuario: ReturnType<typeof userEvent.setup>,
  codigo = ' esq-exp-2026-000010 ',
) => {
  await usuario.type(
    await screen.findByLabelText('Código de la esquela', { exact: false }),
    codigo,
  );
  await usuario.click(screen.getByRole('button', { name: 'Buscar' }));
};

const dato = (etiqueta: string) =>
  screen
    .getByText(etiqueta, { selector: 'dt' })
    .nextElementSibling?.textContent.replace(/\s/g, ' ');

describe('Página Caja (005)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('busca la esquela y muestra expediente, titular, licencia y monto antes de confirmar', async () => {
    const { usuario } = montar({});

    await buscar(usuario);

    expect(await screen.findByRole('heading', { name: 'ESQ-EXP-2026-000010' })).toBeInTheDocument();
    expect(dato('Expediente')).toBe('EXP-2026-000010');
    expect(dato('Titular')).toBe('Titular de Prueba');
    expect(dato('Licencia')).toBe('Licencia de funcionamiento – riesgo medio');
    expect(dato('Monto')).toBe('S/ 177.10');
    expect(dato('Estado del expediente')).toBe('Pendiente de pago');
  });

  it('registra el pago con el recibo y lo confirma', async () => {
    const { llamadas, usuario } = montar({
      'POST /esquelas/ESQ-EXP-2026-000010/pago': () =>
        json({ ...ESQUELA, pagada: true, numeroRecibo: 'REC-0001' }, 201),
    });
    await buscar(usuario);

    await usuario.type(await screen.findByLabelText('Número de recibo'), 'rec-0001');
    await usuario.click(screen.getByRole('button', { name: 'Registrar pago' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pago registrado con el recibo REC-0001.',
    );
    expect(llamadas.find((l) => l.clave.endsWith('/pago'))?.cuerpo).toEqual({
      numeroRecibo: 'rec-0001',
    });
  });

  it('sin recibo no envía nada', async () => {
    const { llamadas, usuario } = montar({});
    await buscar(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Registrar pago' }));

    expect(screen.getByText('Escribe el número de recibo.')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave.endsWith('/pago'))).toBe(false);
  });

  it.each([
    [problema(409, 'esquela-ya-pagada'), 'Esta esquela ya fue pagada.'],
    [problema(409, 'recibo-repetido'), 'Ese número de recibo ya está registrado en otra esquela.'],
    [
      json({ status: 422, errores: [{ campo: 'numeroRecibo', mensaje: 'Recibo inválido' }] }, 422),
      'Recibo inválido',
    ],
  ])('muestra el error del pago (%#)', async (respuesta, mensaje) => {
    const { usuario } = montar({
      'POST /esquelas/ESQ-EXP-2026-000010/pago': () => respuesta.clone(),
    });
    await buscar(usuario);

    await usuario.type(await screen.findByLabelText('Número de recibo'), 'REC-0001');
    await usuario.click(screen.getByRole('button', { name: 'Registrar pago' }));

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });

  it('una esquela ya pagada no ofrece registrar', async () => {
    const { usuario } = montar({
      'GET /esquelas/ESQ-EXP-2026-000010': () =>
        json({ ...ESQUELA, pagada: true, numeroRecibo: 'REC-0009' }),
    });

    await buscar(usuario);

    expect(await screen.findByText(/ya fue pagada con el recibo REC-0009/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
  });

  it('un código que no existe lo dice', async () => {
    const { usuario } = montar({
      'GET /esquelas/ESQ-EXP-2026-000099': () => problema(404, 'no-encontrado'),
    });

    await buscar(usuario, 'ESQ-EXP-2026-000099');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay una esquela con ese código.',
    );
  });

  it('otro rol ve que no tiene permiso', async () => {
    montar({}, ['EVALUADOR']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });
});
