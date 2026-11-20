import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, simularApi, type Manejador } from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { baseTramite, DESAFIO_PRUEBA } from '../../pruebas/tramite-prueba';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

type Usuario = ReturnType<typeof userEvent.setup>;

const EXPEDIENTE = {
  numero: 'EXP-2026-000123',
  estado: 'REGISTRADO',
  ruta: 'A',
  codigoReceta: 'LIC-02',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  canal: 'EN_LINEA',
  presentadoEn: '2026-11-19T15:00:00.000Z',
  vencePlazoEn: null,
  siguientePaso: 'La municipalidad revisará tus documentos.',
};

let subidos = 0;

const manejadoresBase: Record<string, Manejador> = {
  ...baseTramite,
  'POST /identidad/verificar': () => json(DESAFIO_PRUEBA),
  'POST /identidad/verificar-otp': () => json({ token: 'token-identidad', expiraEn: 1800 }),
  'POST /documentos': () => {
    subidos += 1;
    return json(
      {
        documentoId: `00000000-0000-4000-8000-00000000000${String(subidos)}`,
        sha256: 'a'.repeat(64),
        venceEn: '2026-11-20T15:00:00.000Z',
      },
      201,
    );
  },
};

/** Confirma la identidad por la pantalla real y llega al formulario. */
const llegarAlFormulario = async (
  manejadores: Record<string, Manejador> = {},
  { licencia = 'LIC-02', representante = false, esperarFormulario = true } = {},
) => {
  const llamadas = simularApi({ ...manejadoresBase, ...manejadores });
  montarEn(`/tramite/identidad?licencia=${licencia}`);
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Número de documento'), '40000001');
  await usuario.type(screen.getByLabelText('Fecha de emisión del DNI'), '2020-01-15');
  await usuario.type(screen.getByLabelText('RUC'), '10400000011');
  await usuario.type(screen.getByLabelText('Celular', { exact: false }), '987000001');
  if (representante) {
    await usuario.click(screen.getByLabelText('Actúo como representante legal o apoderado'));
    const numeros = screen.getAllByLabelText('Número de documento');
    await usuario.type(numeros[1] as HTMLElement, '40000002');
    const fechas = screen.getAllByLabelText('Fecha de emisión del DNI');
    await usuario.type(fechas[1] as HTMLElement, '2019-05-10');
  }
  await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
  await usuario.type(await screen.findByLabelText('Código de verificación'), '123456');
  await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));
  await screen.findByRole('heading', { name: 'Solicitud de licencia' });
  if (esperarFormulario) {
    await screen.findByRole('group', { name: 'Documentos' });
  }
  return { llamadas, usuario };
};

const pdf = (nombre = 'solicitud.pdf') =>
  new File(['%PDF-1.4 ficticio'], nombre, { type: 'application/pdf' });

const llenarDatos = async (usuario: Usuario) => {
  await usuario.type(screen.getByLabelText('Nombre completo del titular'), 'Titular Uno');
  await usuario.type(screen.getByLabelText('Giro'), 'Bodega');
  await usuario.type(screen.getByLabelText('Dirección'), 'Jr. Ficticio 123');
  await usuario.type(screen.getByLabelText('Zona'), 'Centro');
  await usuario.type(screen.getByLabelText('Área del local en m²', { exact: false }), '40');
};

const subirSolicitud = async (usuario: Usuario) => {
  await usuario.upload(
    screen.getByLabelText('Subir archivo: Solicitud con declaración jurada'),
    pdf(),
  );
  await screen.findByText('Listo: solicitud.pdf');
};

describe('Página Solicitud del trámite', () => {
  beforeEach(() => {
    subidos = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('sin permiso de identidad vuelve a la identidad', async () => {
    simularApi(baseTramite);
    montarEn('/tramite/solicitud?licencia=LIC-02');

    expect(
      await screen.findByRole('heading', { name: 'Paso 1 de 2: tus datos' }),
    ).toBeInTheDocument();
  });

  it('muestra la licencia y los requisitos en orden; sin representante no pide la carta poder', async () => {
    await llegarAlFormulario();

    expect(
      screen.getByText(/Licencia de funcionamiento – riesgo medio\. Tasa: S\/ 177\.10/),
    ).toBeInTheDocument();
    const documentos = within(screen.getByRole('group', { name: 'Documentos' })).getAllByRole(
      'listitem',
    );
    expect(documentos.map((item) => item.querySelector('.documento__nombre')?.textContent)).toEqual(
      [
        'Solicitud con declaración jurada Obligatorio',
        'Planos de ubicación Opcional',
        'Requisitos del giro Opcional',
      ],
    );
    expect(
      within(documentos[1] as HTMLElement).getByText(/presentaste planos/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Carta poder', { exact: false })).not.toBeInTheDocument();
  });

  it('con representante la carta poder es obligatoria', async () => {
    await llegarAlFormulario({}, { representante: true });

    expect(
      screen.getByText('Carta poder', { selector: '.documento__nombre', exact: false }),
    ).toHaveTextContent('Obligatorio');
  });

  it('muestra cuántos minutos quedan del permiso de 30 minutos', async () => {
    await llegarAlFormulario();

    expect(
      screen.getByText('Te quedan 30 minutos para presentar la solicitud.'),
    ).toBeInTheDocument();
  });

  it('avisa cuando faltan 5 minutos o menos', async () => {
    await llegarAlFormulario({
      'POST /identidad/verificar-otp': () => json({ token: 'token-identidad', expiraEn: 240 }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Te quedan 4 minutos para presentar la solicitud\. Si se acaba el tiempo/,
    );
  });

  it('cada campo del titular tiene su propia etiqueta', async () => {
    await llegarAlFormulario();

    expect(screen.getByLabelText('Nombre completo del titular')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Razón social de la empresa (opcional)', { exact: false }),
    ).not.toBe(screen.getByLabelText('Nombre completo del titular'));
    expect(screen.queryByLabelText(/Nombre o razón social/)).not.toBeInTheDocument();
  });

  it('sube un documento con el token de identidad y permite reemplazarlo', async () => {
    const { llamadas, usuario } = await llegarAlFormulario();

    await subirSolicitud(usuario);

    const subida = llamadas.find((l) => l.clave === 'POST /documentos');
    expect(subida?.autorizacion).toBe('Bearer token-identidad');
    expect(
      screen.getByLabelText('Reemplazar archivo: Solicitud con declaración jurada'),
    ).toBeInTheDocument();
  });

  it.each([
    [413, 'demasiado-grande', /más de 10 MB/],
    [415, 'tipo-no-permitido', /Solo se aceptan/],
  ])(
    'un archivo rechazado (%i) muestra el motivo junto al documento',
    async (estado, tipo, motivo) => {
      const { usuario } = await llegarAlFormulario({
        'POST /documentos': () => problema(estado, tipo),
      });

      await usuario.upload(
        screen.getByLabelText('Subir archivo: Solicitud con declaración jurada'),
        pdf(),
      );

      expect(await screen.findByText(motivo)).toBeInTheDocument();
    },
  );

  it('sin los datos obligatorios marca cada campo, enfoca el resumen y no envía', async () => {
    const { llamadas, usuario } = await llegarAlFormulario();

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    const resumen = await screen.findByText('Revisa estos datos antes de presentar:');
    await waitFor(() => {
      expect(resumen.parentElement).toHaveFocus();
    });
    expect(screen.getByLabelText('Giro')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escribe el giro del negocio')).toBeInTheDocument();
    expect(screen.getAllByText('Adjunta este documento').length).toBeGreaterThan(0);
    expect(llamadas.some((l) => l.clave === 'POST /expedientes')).toBe(false);
  });

  it('en la licencia de bodegas marca un área mayor a 50 m²', async () => {
    const { usuario } = await llegarAlFormulario({}, { licencia: 'LIC-09' });
    await llenarDatos(usuario);
    const area = screen.getByLabelText('Área del local en m²', { exact: false });
    await usuario.clear(area);
    await usuario.type(area, '60');

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findAllByText(/hasta 50 m²/)).not.toHaveLength(0);
    expect(area).toHaveAttribute('aria-invalid', 'true');
  });

  it('presenta con la Idempotency-Key y muestra el comprobante', async () => {
    const claves: (string | null)[] = [];
    const { llamadas, usuario } = await llegarAlFormulario({
      'POST /expedientes': (peticion) => {
        claves.push(peticion.headers.get('Idempotency-Key'));
        return json(EXPEDIENTE, 201);
      },
    });
    await llenarDatos(usuario);
    await subirSolicitud(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByText('EXP-2026-000123')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Solicitud presentada' })).toBeInTheDocument();
    const envio = llamadas.find((l) => l.clave === 'POST /expedientes');
    expect(envio?.autorizacion).toBe('Bearer token-identidad');
    expect(envio?.cuerpo).toMatchObject({
      codigoReceta: 'LIC-02',
      identidad: { numeroDocumento: '40000001' },
      nombreTitular: 'Titular Uno',
      razonSocial: null,
      correo: null,
      areaM2: 40,
      documentos: [{ requisitoId: 11, documentoId: '00000000-0000-4000-8000-000000000001' }],
    });
    expect(claves[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('desactiva "Presentar" mientras envía y reutiliza la misma clave al reintentar', async () => {
    const claves: (string | null)[] = [];
    let soltar: (respuesta: Response) => void = () => undefined;
    const { usuario } = await llegarAlFormulario({
      'POST /expedientes': (peticion) => {
        claves.push(peticion.headers.get('Idempotency-Key'));
        return claves.length === 1
          ? new Promise<Response>((resolver) => {
              soltar = resolver;
            })
          : json(EXPEDIENTE, 200);
      },
    });
    await llenarDatos(usuario);
    await subirSolicitud(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));
    expect(await screen.findByRole('button', { name: 'Presentando…' })).toBeDisabled();
    soltar(problema(503, 'servicio-no-disponible'));
    expect(await screen.findByText(/no se duplicará/)).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByText('EXP-2026-000123')).toBeInTheDocument();
    expect(claves).toHaveLength(2);
    expect(claves[1]).toBe(claves[0]);
  });

  it('un 422 de la API se muestra junto al documento', async () => {
    const { usuario } = await llegarAlFormulario({
      'POST /expedientes': () =>
        json(
          {
            status: 422,
            errores: [{ campo: 'documentos.requisito.11', mensaje: 'Falta este documento' }],
          },
          422,
        ),
    });
    await llenarDatos(usuario);
    await subirSolicitud(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findAllByText(/Falta este documento/)).toHaveLength(2);
  });

  it.each([
    [401, 'no-autenticado', /venció/],
    [409, 'permiso-usado', /ya se usó/],
  ])('con %i vuelve a la identidad conservando lo escrito', async (estado, tipo, aviso) => {
    let intentos = 0;
    const { usuario } = await llegarAlFormulario({
      'POST /expedientes': () => {
        intentos += 1;
        return intentos === 1 ? problema(estado, tipo) : json(EXPEDIENTE, 201);
      },
    });
    await llenarDatos(usuario);
    await subirSolicitud(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByText(aviso)).toBeInTheDocument();
    expect(screen.getByLabelText('Número de documento')).toHaveValue('40000001');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
    await usuario.type(await screen.findByLabelText('Código de verificación'), '123456');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByLabelText('Giro')).toHaveValue('Bodega');
    expect(screen.queryByText(/Listo:/)).not.toBeInTheDocument();
  });

  it('si la licencia no se puede solicitar en línea lo dice', async () => {
    await llegarAlFormulario(
      { 'GET /catalogo/recetas/LIC-02': () => problema(404, 'no-encontrado') },
      { esperarFormulario: false },
    );

    expect(
      await screen.findByText('Esta licencia no se puede solicitar en línea.'),
    ).toBeInTheDocument();
  });
});
