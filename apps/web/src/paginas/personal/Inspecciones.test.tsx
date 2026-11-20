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

// Datos FICTICIOS con la forma del contrato (Inspeccion de la 006).
const INSPECTOR = '00000000-0000-4000-8000-0000000000a1';
const PENDIENTE = {
  id: '00000000-0000-4000-8000-000000000101',
  numeroExpediente: 'EXP-2026-000010',
  tipo: 'PREVIA',
  estado: 'PENDIENTE',
  inspectorId: null,
  programadaPara: null,
  giro: 'Restaurante',
  nombreLicencia: 'Riesgo alto',
  nombreInspector: null,
  resultado: null,
};
const ASIGNADA = {
  ...PENDIENTE,
  id: '00000000-0000-4000-8000-000000000102',
  numeroExpediente: 'EXP-2026-000011',
  estado: 'ASIGNADA',
  inspectorId: INSPECTOR,
  programadaPara: '2026-11-25',
  nombreInspector: 'Inspector de Prueba',
  direccion: 'Jr. Ficticio 123, Huanta',
};

const pagina = (datos: object[]) => json({ pagina: 1, porPagina: 100, total: datos.length, datos });

const montar = (
  roles: string[],
  manejadores: Record<string, Manejador>,
  ruta = '/personal/inspecciones',
) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => json(sesionDePrueba({ roles })),
    'GET /inspecciones/inspectores': () => json([{ id: INSPECTOR, nombre: 'Inspector de Prueba' }]),
    ...manejadores,
  });
  montarEn(ruta);
  return { llamadas, usuario: userEvent.setup() };
};

describe('Página Inspecciones (006)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('la jefatura asigna una inspección pendiente a un inspector y una fecha', async () => {
    const { llamadas, usuario } = montar(['JEFATURA'], {
      'GET /inspecciones': () => pagina([PENDIENTE]),
      [`POST /inspecciones/${PENDIENTE.id}/asignar`]: () =>
        json({ ...PENDIENTE, estado: 'ASIGNADA' }),
    });
    const tarjeta = await screen.findByRole('article', { name: 'Inspección de EXP-2026-000010' });
    expect(within(tarjeta).queryByText('Dirección')).not.toBeInTheDocument();

    await usuario.click(within(tarjeta).getByRole('button', { name: 'Asignar' }));
    await usuario.selectOptions(await screen.findByLabelText('Inspector'), INSPECTOR);
    await usuario.click(screen.getByRole('button', { name: 'Guardar asignación' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Inspección de EXP-2026-000010 asignada.',
    );
    const envio = llamadas.find((l) => l.clave.endsWith('/asignar'));
    expect(envio?.cuerpo).toMatchObject({ inspectorId: INSPECTOR });
    expect((envio?.cuerpo as { programadaPara: string }).programadaPara).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('sin elegir inspector no envía; un error de la API se muestra', async () => {
    const { llamadas, usuario } = montar(['JEFATURA'], {
      'GET /inspecciones': () => pagina([PENDIENTE]),
      [`POST /inspecciones/${PENDIENTE.id}/asignar`]: () =>
        json(
          {
            status: 422,
            errores: [
              { campo: 'programadaPara', mensaje: 'La fecha programada no puede ser pasada' },
            ],
          },
          422,
        ),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Asignar' }));

    await usuario.click(screen.getByRole('button', { name: 'Guardar asignación' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige un inspector.');
    expect(llamadas.some((l) => l.clave.endsWith('/asignar'))).toBe(false);

    await usuario.selectOptions(screen.getByLabelText('Inspector'), INSPECTOR);
    await usuario.click(screen.getByRole('button', { name: 'Guardar asignación' }));
    expect(await screen.findByText('La fecha programada no puede ser pasada')).toBeInTheDocument();
  });

  it('la jefatura filtra por estado', async () => {
    const { llamadas, usuario } = montar(['JEFATURA'], { 'GET /inspecciones': () => pagina([]) });
    await screen.findByText('No hay inspecciones.');

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'REALIZADA');

    await screen.findByText('No hay inspecciones.');
    expect(llamadas.filter((l) => l.clave === 'GET /inspecciones').length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('el inspector ve sus tarjetas con la dirección y el enlace para registrar', async () => {
    montar(['INSPECTOR'], { 'GET /inspecciones': () => pagina([ASIGNADA]) });

    const tarjeta = await screen.findByRole('article', { name: 'Inspección de EXP-2026-000011' });

    expect(within(tarjeta).getByText('Jr. Ficticio 123, Huanta')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('link', { name: 'Registrar resultado' })).toHaveAttribute(
      'href',
      `/personal/inspecciones/${ASIGNADA.id}/resultado`,
    );
    expect(within(tarjeta).queryByText('Inspector de Prueba')).not.toBeInTheDocument();
  });

  it('si falla la carga lo dice; otro rol no entra', async () => {
    montar(['INSPECTOR'], { 'GET /inspecciones': () => problema(500, 'error') });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar');
  });

  it('otro rol ve que no tiene permiso', async () => {
    montar(['CAJA'], {});
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });
});

describe('Página Resultado de la inspección (006)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  const ruta = `/personal/inspecciones/${ASIGNADA.id}/resultado`;
  const foto = () =>
    new File([new Uint8Array([0xff, 0xd8, 0xff])], 'frente.jpg', { type: 'image/jpeg' });

  beforeEach(() => {
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:foto'), revokeObjectURL: jest.fn() });
  });

  it('el inspector registra FAVORABLE con foto y certificado', async () => {
    let cuerpo: FormData | null = null;
    const { usuario } = montar(
      ['INSPECTOR'],
      {
        'GET /inspecciones': () => pagina([ASIGNADA]),
        [`POST /inspecciones/${ASIGNADA.id}/resultado`]: async (peticion) => {
          cuerpo = await peticion.formData();
          return json({ ...ASIGNADA, estado: 'REALIZADA', resultado: 'FAVORABLE' }, 201);
        },
      },
      ruta,
    );
    expect(
      await screen.findByText(/EXP-2026-000011 · Jr. Ficticio 123, Huanta/),
    ).toBeInTheDocument();

    await usuario.click(screen.getByLabelText('Favorable'));
    await usuario.type(screen.getByLabelText('Número del certificado ITSE'), 'ITSE-0001');
    await usuario.upload(screen.getByLabelText('Fotos (de 1 a 5, JPG o PNG)'), foto());
    expect(screen.getByRole('img', { name: 'Foto 1' })).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Registrar resultado' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Resultado registrado.');
    const enviado = cuerpo as unknown as FormData;
    expect(enviado.get('resultado')).toBe('FAVORABLE');
    expect(enviado.get('numeroCertificado')).toBe('ITSE-0001');
    expect(enviado.getAll('fotos')).toHaveLength(1);
  });

  it('valida antes de enviar: resultado, fotos, observaciones y certificado', async () => {
    const { llamadas, usuario } = montar(
      ['INSPECTOR'],
      { 'GET /inspecciones': () => pagina([ASIGNADA]) },
      ruta,
    );
    await screen.findByText(/EXP-2026-000011/);
    const enviar = () => usuario.click(screen.getByRole('button', { name: 'Registrar resultado' }));

    await enviar();
    expect(screen.getByRole('alert')).toHaveTextContent('Elige el resultado');
    await usuario.click(screen.getByLabelText('Desfavorable'));
    await enviar();
    expect(screen.getByRole('alert')).toHaveTextContent('Adjunta al menos una foto.');
    await usuario.upload(screen.getByLabelText('Fotos (de 1 a 5, JPG o PNG)'), foto());
    await enviar();
    expect(screen.getByRole('alert')).toHaveTextContent('observaciones del resultado desfavorable');
    await usuario.click(screen.getByLabelText('Favorable'));
    await enviar();
    expect(screen.getByRole('alert')).toHaveTextContent('número del certificado');
    await usuario.click(screen.getByRole('button', { name: 'Quitar foto 1' }));
    expect(screen.queryByRole('img', { name: 'Foto 1' })).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.clave.endsWith('/resultado'))).toBe(false);
  });

  it('más de 5 fotos se rechazan; un 409 se explica', async () => {
    const { usuario } = montar(
      ['INSPECTOR'],
      {
        'GET /inspecciones': () => pagina([ASIGNADA]),
        [`POST /inspecciones/${ASIGNADA.id}/resultado`]: () => problema(409, 'ya-registrada'),
      },
      ruta,
    );
    await screen.findByText(/EXP-2026-000011/);
    const entrada = screen.getByLabelText('Fotos (de 1 a 5, JPG o PNG)');

    await usuario.upload(entrada, Array.from({ length: 6 }, foto));
    expect(screen.getByRole('alert')).toHaveTextContent('hasta 5 fotos');

    await usuario.upload(entrada, foto());
    await usuario.click(screen.getByLabelText('Desfavorable'));
    await usuario.type(screen.getByLabelText('Observaciones'), 'Sin extintores');
    await usuario.click(screen.getByRole('button', { name: 'Registrar resultado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene resultado');
  });

  it('una inspección que no está entre las suyas lo dice', async () => {
    montar(['INSPECTOR'], { 'GET /inspecciones': () => pagina([]) }, ruta);

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esta inspección');
  });
});
