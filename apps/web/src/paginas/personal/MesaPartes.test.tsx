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
import { LICENCIAS_PRUEBA, RECETA_LIC02, RECETA_LIC09 } from '../../pruebas/tramite-prueba';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

type Usuario = ReturnType<typeof userEvent.setup>;

// Estas pruebas escriben todo el formulario tecla por tecla y suben documentos; con la suite completa
// en paralelo alguna superaba a veces los 5 s por defecto de Jest. 15 s deja margen sin ocultar cuelgues.
jest.setTimeout(15_000);

const EXPEDIENTE = {
  numero: 'EXP-2026-000200',
  estado: 'REGISTRADO',
  ruta: 'A',
  codigoReceta: 'LIC-02',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  canal: 'MESA_PARTES',
  presentadoEn: '2026-11-19T15:00:00.000Z',
  vencePlazoEn: null,
  siguientePaso: 'La municipalidad revisará tus documentos.',
};

const base = (roles: string[] = ['MESA_PARTES']): Record<string, Manejador> => ({
  'POST /auth/renovar': () => json(sesionDePrueba({ roles }, 'token-mesa')),
  'GET /catalogo/recetas': () => json(LICENCIAS_PRUEBA),
  'GET /catalogo/recetas/LIC-02': () => json(RECETA_LIC02),
  'GET /catalogo/recetas/LIC-09': () => json(RECETA_LIC09),
  'POST /documentos': () =>
    json(
      {
        documentoId: '00000000-0000-4000-8000-000000000001',
        sha256: 'a'.repeat(64),
        venceEn: '2026-11-20T15:00:00.000Z',
      },
      201,
    ),
});

/** Datos FICTICIOS del titular extranjero (quickstart.md de la 004). */
const llenarTitularExtranjero = async (usuario: Usuario) => {
  const [tipo] = screen.getAllByLabelText('Tipo de documento');
  await usuario.selectOptions(tipo as HTMLElement, 'CE');
  await usuario.type(screen.getByLabelText('Número de documento'), '000123456');
  await usuario.type(screen.getByLabelText('RUC'), '15000123456');
  await usuario.type(screen.getByLabelText('Celular'), '987000002');
};

const llenarFormulario = async (usuario: Usuario) => {
  await usuario.type(screen.getByLabelText('Nombre completo del titular'), 'Titular Extranjero');
  await usuario.type(screen.getByLabelText('Giro'), 'Bodega');
  await usuario.type(screen.getByLabelText('Dirección'), 'Jr. Ficticio 456');
  await usuario.type(screen.getByLabelText('Zona'), 'Centro');
  await usuario.type(screen.getByLabelText('Área del local en m²', { exact: false }), '35');
  await usuario.upload(
    screen.getByLabelText('Subir archivo: Solicitud con declaración jurada'),
    new File(['%PDF-1.4 ficticio'], 'solicitud.pdf', { type: 'application/pdf' }),
  );
  await screen.findByText('Listo: solicitud.pdf');
};

const abrir = async (manejadores: Record<string, Manejador> = {}, roles?: string[]) => {
  const llamadas = simularApi({ ...base(roles), ...manejadores });
  montarEn('/personal/mesa-partes/nueva?licencia=LIC-02');
  const usuario = userEvent.setup();
  await screen.findByRole('group', { name: 'Documentos' });
  return { llamadas, usuario };
};

describe('Página Mesa de partes (registro presencial)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('registra con la sesión del personal, sin pedir código, y muestra el comprobante', async () => {
    const claves: (string | null)[] = [];
    const { llamadas, usuario } = await abrir({
      'POST /expedientes': (peticion) => {
        claves.push(peticion.headers.get('Idempotency-Key'));
        return json(EXPEDIENTE, 201);
      },
    });
    expect(screen.getByLabelText('Licencia solicitada')).toHaveValue('LIC-02');
    expect(screen.queryByLabelText(/Código/)).not.toBeInTheDocument();
    await llenarTitularExtranjero(usuario);
    expect(screen.queryByLabelText('Fecha de emisión del DNI')).not.toBeInTheDocument();
    await llenarFormulario(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByText('EXP-2026-000200')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
    const subida = llamadas.find((l) => l.clave === 'POST /documentos');
    expect(subida?.autorizacion).toBe('Bearer token-mesa');
    const registro = llamadas.find((l) => l.clave === 'POST /expedientes');
    expect(registro?.autorizacion).toBe('Bearer token-mesa');
    expect(registro?.cuerpo).toMatchObject({
      codigoReceta: 'LIC-02',
      identidad: {
        tipoDocumento: 'CE',
        numeroDocumento: '000123456',
        ruc: '15000123456',
        celular: '987000002',
      },
      areaM2: 35,
    });
    expect(claves[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(llamadas.some((l) => l.clave.startsWith('POST /identidad'))).toBe(false);
  });

  it('con representante pide sus datos y la carta poder', async () => {
    const { usuario } = await abrir();

    await usuario.click(screen.getByLabelText('Actúa un representante legal o apoderado'));

    expect(screen.getByRole('group', { name: 'Representante' })).toBeInTheDocument();
    expect(
      screen.getByText('Carta poder', { selector: '.documento__nombre', exact: false }),
    ).toHaveTextContent('Obligatorio');
  });

  it('cambiar de licencia muestra sus requisitos', async () => {
    const { usuario } = await abrir();

    await usuario.selectOptions(screen.getByLabelText('Licencia solicitada'), 'LIC-09');

    expect(await screen.findByText(/Licencia provisional para bodegas\. Tasa/)).toBeInTheDocument();
  });

  it('una identidad que no coincide se avisa sin nombrar el dato', async () => {
    const { usuario } = await abrir({
      'POST /expedientes': () =>
        json(
          {
            status: 422,
            errores: [{ campo: 'identidad', mensaje: 'Los datos no coinciden' }],
          },
          422,
        ),
    });
    await llenarTitularExtranjero(usuario);
    await llenarFormulario(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/);
  });

  it('un error de formato de la identidad se marca en su campo', async () => {
    const { usuario } = await abrir({
      'POST /expedientes': () =>
        json(
          { status: 422, errores: [{ campo: 'identidad.ruc', mensaje: 'El RUC no es válido' }] },
          422,
        ),
    });
    await llenarTitularExtranjero(usuario);
    await llenarFormulario(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByText('El RUC no es válido')).toBeInTheDocument();
    expect(screen.getByLabelText('RUC')).toHaveAttribute('aria-invalid', 'true');
  });

  it('si el servicio de identificación no responde lo avisa', async () => {
    const { usuario } = await abrir({
      'POST /expedientes': () => problema(503, 'identificacion-no-disponible'),
    });
    await llenarTitularExtranjero(usuario);
    await llenarFormulario(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/servicio de identificación/);
  });

  it('sin los datos obligatorios no envía nada', async () => {
    const { llamadas, usuario } = await abrir();

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByText('Revisa estos datos antes de presentar:')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave === 'POST /expedientes')).toBe(false);
  });

  it('si la sesión vence pide ingresar y, al volver, conserva lo escrito', async () => {
    let renovaciones = 0;
    const { usuario } = await abrir({
      'POST /auth/renovar': () => {
        renovaciones += 1;
        return renovaciones === 1
          ? json(sesionDePrueba({ roles: ['MESA_PARTES'] }, 'token-mesa'))
          : problema(401, 'no-autenticado');
      },
      'POST /expedientes': () => problema(401, 'no-autenticado'),
      'POST /auth/iniciar-sesion': () =>
        json({
          desafioId: '00000000-0000-4000-8000-0000000000d1',
          venceEn: '2026-11-19T10:05:00.000Z',
          celularEnmascarado: '9*****321',
        }),
      'POST /auth/verificar-otp': () =>
        json(sesionDePrueba({ roles: ['MESA_PARTES'] }, 'token-nuevo')),
    });
    await llenarTitularExtranjero(usuario);
    await llenarFormulario(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Presentar solicitud' }));

    expect(await screen.findByText(/Tu sesión terminó/)).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Correo'), 'persona@ejemplo.pe');
    await usuario.type(screen.getByLabelText('Clave'), 'ClaveActual2026');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await usuario.type(await screen.findByLabelText('Código'), '123456');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByLabelText('Giro')).toHaveValue('Bodega');
    expect(screen.getByLabelText('Número de documento')).toHaveValue('000123456');
    expect(screen.getByText('Listo: solicitud.pdf')).toBeInTheDocument();
  });

  it('otro rol ve que no tiene permiso', async () => {
    simularApi(base(['CAJA']));
    montarEn('/personal/mesa-partes/nueva');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tiene permiso para ver esta página',
    );
  });
});
