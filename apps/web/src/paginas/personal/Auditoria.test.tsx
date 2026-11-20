import { screen, within } from '@testing-library/react';
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

// Datos FICTICIOS con la forma del contrato (RegistroAuditoria de la 005).
const PAGO = {
  usuarioId: '00000000-0000-4000-8000-0000000000c1',
  nombreUsuario: 'Cajero de Prueba',
  accion: 'REGISTRAR_PAGO',
  referencia: 'ESQ-EXP-2026-000010',
  detalle: { reciboAnterior: null, reciboNuevo: 'REC-0001', motivo: null },
  ocurridoEn: '2026-11-20T15:00:00.000Z',
};
const CORRECCION = {
  ...PAGO,
  usuarioId: '00000000-0000-4000-8000-0000000000c2',
  nombreUsuario: 'Jefa de Prueba',
  accion: 'CORREGIR_RECIBO',
  detalle: { reciboAnterior: 'REC-0001', reciboNuevo: 'REC-0002', motivo: 'Mal digitado en caja' },
  ocurridoEn: '2026-11-21T15:00:00.000Z',
};

const pagina = (datos: object[], total = datos.length, numero = 1) =>
  json({ pagina: numero, porPagina: 20, total, datos });

const montar = (manejadores: Record<string, Manejador>, roles = ['JEFATURA']) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    ...manejadores,
  });
  montarEn('/personal/auditoria');
  return { llamadas, usuario: userEvent.setup() };
};

describe('Página Auditoría de pagos (005)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('lista pagos y correcciones con usuario, recibo y motivo', async () => {
    montar({ 'GET /pagos/auditoria': () => pagina([CORRECCION, PAGO]) });

    const filas = await screen.findAllByRole('row');

    expect(within(filas[1] as HTMLElement).getByText('Recibo corregido')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('REC-0001 → REC-0002')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('Mal digitado en caja')).toBeInTheDocument();
    expect(within(filas[2] as HTMLElement).getByText('Cajero de Prueba')).toBeInTheDocument();
  });

  it('filtra por fechas y pagina', async () => {
    const { llamadas, usuario } = montar({
      'GET /pagos/auditoria': (peticion) => {
        const url = new URL(peticion.url);
        return pagina([PAGO], 45, Number(url.searchParams.get('pagina') ?? '1'));
      },
    });
    await screen.findByText('Página 1 de 3');

    await usuario.type(screen.getByLabelText('Desde'), '2026-11-20');
    await usuario.type(screen.getByLabelText('Hasta'), '2026-11-21');
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    const urls = llamadas.filter((l) => l.clave === 'GET /pagos/auditoria');
    expect(urls.length).toBeGreaterThanOrEqual(3);
  });

  it('corrige un recibo con motivo y recarga', async () => {
    const { llamadas, usuario } = montar({
      'GET /pagos/auditoria': () => pagina([PAGO]),
      'PATCH /esquelas/ESQ-EXP-2026-000010/recibo': () =>
        json({
          codigo: 'ESQ-EXP-2026-000010',
          numeroExpediente: 'EXP-2026-000010',
          concepto: 'Licencia',
          monto: '177.10',
          pagada: true,
          numeroRecibo: 'REC-0002',
          pagadaEn: '2026-11-20T15:00:00.000Z',
          generadaEn: '2026-11-20T14:00:00.000Z',
        }),
    });

    await usuario.click(await screen.findByRole('button', { name: 'Corregir recibo' }));
    await usuario.type(screen.getByLabelText('Número de recibo correcto'), 'REC-0002');
    await usuario.type(screen.getByLabelText('Motivo de la corrección'), 'Mal digitado en caja');
    await usuario.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Recibo de ESQ-EXP-2026-000010 corregido a REC-0002.',
    );
    expect(llamadas.find((l) => l.clave.startsWith('PATCH'))?.cuerpo).toEqual({
      numeroRecibo: 'REC-0002',
      motivo: 'Mal digitado en caja',
    });
  });

  it('sin motivo suficiente no envía; un recibo repetido se explica', async () => {
    const { llamadas, usuario } = montar({
      'GET /pagos/auditoria': () => pagina([PAGO]),
      'PATCH /esquelas/ESQ-EXP-2026-000010/recibo': () => problema(409, 'recibo-repetido'),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Corregir recibo' }));
    await usuario.type(screen.getByLabelText('Número de recibo correcto'), 'REC-0002');

    await usuario.type(screen.getByLabelText('Motivo de la corrección'), 'corto');
    await usuario.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 10 caracteres');
    expect(llamadas.some((l) => l.clave.startsWith('PATCH'))).toBe(false);

    await usuario.type(screen.getByLabelText('Motivo de la corrección'), ' pero ahora sí');
    await usuario.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(
      await screen.findByText('Ese número de recibo ya está registrado en otra esquela.'),
    ).toBeInTheDocument();
  });

  it('otro rol ve que no tiene permiso', async () => {
    montar({}, ['CAJA']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });
});
