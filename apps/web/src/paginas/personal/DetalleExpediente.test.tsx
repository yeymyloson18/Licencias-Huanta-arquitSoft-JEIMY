import { screen, waitFor, within } from '@testing-library/react';
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

const DOCUMENTO_ID = '00000000-0000-4000-8000-0000000000a1';

// Datos FICTICIOS con la forma del contrato (Expediente).
const EXPEDIENTE = {
  numero: 'EXP-2026-000004',
  estado: 'REGISTRADO',
  ruta: 'B',
  codigoReceta: 'LIC-03',
  nombreLicencia: 'Licencia de funcionamiento – riesgo alto',
  nombreTitular: 'Titular de Prueba',
  giro: 'Bodega',
  presentadoEn: '2026-11-04T15:00:00.000Z',
  vencePlazoEn: null,
  diasHabilesRestantes: null,
  version: 1,
  canal: 'MESA_PARTES',
  nivelRiesgoPropuesto: null,
  nivelRiesgoConfirmado: null,
  documentoTitularEnmascarado: '4*****01',
  razonSocial: null,
  nombreComercial: 'Bodega Ficticia',
  direccion: 'Jr. Ficticio 123, Huanta',
  zona: 'Centro',
  areaM2: 40,
  codigoEsquela: null,
  numeroLicencia: null,
  documentos: [
    {
      id: DOCUMENTO_ID,
      requisitoId: 11,
      nombreOriginal: 'solicitud.pdf',
      tipoMime: 'application/pdf',
    },
  ],
  observaciones: [],
  historial: [
    {
      estadoAnterior: null,
      estadoNuevo: 'REGISTRADO',
      comentario: 'Registrada en mesa de partes',
      ocurridoEn: '2026-11-04T15:00:00.000Z',
    },
  ],
};

const montar = (manejadores: Record<string, Manejador>) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles: ['JEFATURA'] }, 'token-jefatura')),
    ...manejadores,
  });
  montarEn('/personal/expedientes/EXP-2026-000004');
  return llamadas;
};

const dato = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Página Detalle del expediente', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra los datos, el documento enmascarado, los documentos y el historial', async () => {
    montar({ 'GET /expedientes/EXP-2026-000004': () => json(EXPEDIENTE) });

    await screen.findByRole('article', { name: 'Expediente EXP-2026-000004' });
    expect(dato('Licencia')).toBe('Licencia de funcionamiento – riesgo alto');
    expect(dato('Estado')).toBe('Registrado');
    expect(dato('Canal')).toBe('Mesa de partes');
    expect(dato('Documento del titular')).toBe('4*****01');
    expect(dato('Dirección')).toBe('Jr. Ficticio 123, Huanta');
    expect(dato('Área')).toBe('40 m²');
    expect(screen.queryByText('Razón social', { selector: 'dt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar solicitud.pdf' })).toBeInTheDocument();
    // 013 (R-11): las migas de pan del área del personal también son un <ol>; el historial se busca
    // dentro del contenido de la pantalla.
    const historial = within(screen.getByRole('main'))
      .getAllByRole('list')
      .find((lista) => lista.tagName === 'OL');
    expect(within(historial as HTMLElement).getByRole('listitem')).toHaveTextContent(
      /^Registrado — Registrada en mesa de partes/,
    );
  });

  it('descarga el documento con la sesión y lo guarda con su nombre', async () => {
    const crear = jest.fn(() => 'blob:documento');
    const revocar = jest.fn();
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: revocar });
    const clic = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const llamadas = montar({
      'GET /expedientes/EXP-2026-000004': () => json(EXPEDIENTE),
      [`GET /expedientes/EXP-2026-000004/documentos/${DOCUMENTO_ID}`]: () =>
        new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    });
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Descargar solicitud.pdf' }));

    await screen.findByRole('article');
    expect(crear).toHaveBeenCalledTimes(1);
    expect(clic).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledWith('blob:documento');
    const descarga = llamadas.find((l) => l.clave.includes('/documentos/'));
    expect(descarga?.autorizacion).toBe('Bearer token-jefatura');
  });

  it('jefatura descarga la esquela de un expediente PAGADO con su sesión (005)', async () => {
    Object.assign(URL, {
      createObjectURL: jest.fn(() => 'blob:esquela'),
      revokeObjectURL: jest.fn(),
    });
    const clic = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const llamadas = montar({
      'GET /expedientes/EXP-2026-000004': () => json({ ...EXPEDIENTE, estado: 'PAGADO' }),
      'GET /esquelas/ESQ-EXP-2026-000004/pdf': () =>
        new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    });
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Descargar esquela' }));

    await waitFor(() => {
      expect(clic).toHaveBeenCalledTimes(1);
    });
    expect(llamadas.find((l) => l.clave.endsWith('/pdf'))?.autorizacion).toBe(
      'Bearer token-jefatura',
    );
  });

  it('jefatura ve la auditoría del expediente con el usuario de cada decisión (005)', async () => {
    montar({
      'GET /expedientes/EXP-2026-000004': () => json(EXPEDIENTE),
      'GET /expedientes/EXP-2026-000004/auditoria': () =>
        json([
          {
            usuarioId: null,
            nombreUsuario: null,
            accion: 'PRESENTAR_EN_LINEA',
            referencia: 'EXP-2026-000004',
            detalle: null,
            ocurridoEn: '2026-11-19T15:00:00.000Z',
          },
          {
            usuarioId: '00000000-0000-4000-8000-0000000000e1',
            nombreUsuario: 'Evaluador de Prueba',
            accion: 'INICIAR_EVALUACION',
            referencia: 'EXP-2026-000004',
            detalle: null,
            ocurridoEn: '2026-11-20T15:00:00.000Z',
          },
        ]),
    });

    const seccion = await screen.findByRole('region', { name: 'Auditoría del expediente' });

    expect(
      await within(seccion).findByText(/Empezó la revisión — Evaluador de Prueba/),
    ).toBeInTheDocument();
    expect(within(seccion).getByText(/Presentado en línea — El titular/)).toBeInTheDocument();
  });

  it('con licencia muestra su número y la descarga con la sesión (006)', async () => {
    Object.assign(URL, {
      createObjectURL: jest.fn(() => 'blob:licencia'),
      revokeObjectURL: jest.fn(),
    });
    const clic = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const llamadas = montar({
      'GET /expedientes/EXP-2026-000004': () =>
        json({ ...EXPEDIENTE, estado: 'FINALIZADO', numeroLicencia: 'LF-2026-000004' }),
      'GET /licencias/LF-2026-000004/pdf': () =>
        new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    });
    const usuario = userEvent.setup();

    const seccion = await screen.findByRole('region', { name: 'Licencia' });
    expect(within(seccion).getByText('LF-2026-000004')).toBeInTheDocument();
    await usuario.click(within(seccion).getByRole('button', { name: 'Descargar licencia' }));

    await waitFor(() => {
      expect(clic).toHaveBeenCalledTimes(1);
    });
    expect(llamadas.find((l) => l.clave.endsWith('LF-2026-000004/pdf'))?.autorizacion).toBe(
      'Bearer token-jefatura',
    );
  });

  it('sin esquela todavía (REGISTRADO) no ofrece descargarla (005)', async () => {
    montar({ 'GET /expedientes/EXP-2026-000004': () => json(EXPEDIENTE) });

    await screen.findByRole('article');

    expect(screen.queryByRole('button', { name: 'Descargar esquela' })).not.toBeInTheDocument();
  });

  it('si el documento ya no existe lo avisa', async () => {
    montar({
      'GET /expedientes/EXP-2026-000004': () => json(EXPEDIENTE),
      [`GET /expedientes/EXP-2026-000004/documentos/${DOCUMENTO_ID}`]: () =>
        problema(404, 'no-encontrado'),
    });
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Descargar solicitud.pdf' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El documento ya no está disponible.',
    );
  });

  it('un número inexistente muestra que no existe', async () => {
    montar({ 'GET /expedientes/EXP-2026-000004': () => problema(404, 'no-encontrado') });

    expect(await screen.findByText('No existe un expediente con ese número.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a la bandeja' })).toHaveAttribute(
      'href',
      '/personal/expedientes',
    );
  });

  it('si falla, avisa y permite reintentar', async () => {
    let llamadas = 0;
    montar({
      'GET /expedientes/EXP-2026-000004': () => {
        llamadas += 1;
        return llamadas === 1 ? problema(503, 'servicio-no-disponible') : json(EXPEDIENTE);
      },
    });
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
  });
});
