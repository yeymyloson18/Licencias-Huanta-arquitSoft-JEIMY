import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, simularApi, type Manejador } from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';
import { baseTramite, DESAFIO_PRUEBA, IDENTIDAD_PRUEBA } from '../../pruebas/tramite-prueba';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

const llenarTitular = async (usuario: ReturnType<typeof userEvent.setup>) => {
  await usuario.type(await screen.findByLabelText('Número de documento'), '40000001');
  await usuario.type(screen.getByLabelText('Fecha de emisión del DNI'), '2020-01-15');
  await usuario.type(screen.getByLabelText('RUC'), '10400000011');
  await usuario.type(screen.getByLabelText('Celular', { exact: false }), '987000001');
};

const enviarDatos = async (
  manejadores: Record<string, Manejador>,
  ruta = '/tramite/identidad?licencia=LIC-02',
) => {
  const llamadas = simularApi({ ...baseTramite, ...manejadores });
  montarEn(ruta);
  const usuario = userEvent.setup();
  await screen.findByText('Licencia de funcionamiento – riesgo medio');
  await llenarTitular(usuario);
  await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
  return { llamadas, usuario };
};

describe('Página Identidad del trámite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('paso 1 → paso 2 → formulario, con el foco en el título de cada paso', async () => {
    const { llamadas, usuario } = await enviarDatos({
      'POST /identidad/verificar': () => json(DESAFIO_PRUEBA),
      'POST /identidad/verificar-otp': () => json({ token: 'token-identidad', expiraEn: 900 }),
    });

    const paso2 = await screen.findByRole('heading', {
      name: 'Paso 2 de 2: código de verificación',
    });
    await waitFor(() => {
      expect(paso2).toHaveFocus();
    });
    expect(screen.getByText(/9\*\*\*\*\*001/)).toBeInTheDocument();
    const codigo = screen.getByLabelText('Código de verificación');
    expect(codigo).toHaveAttribute('autocomplete', 'one-time-code');
    expect(codigo).toHaveAttribute('inputmode', 'numeric');
    expect(llamadas.find((l) => l.clave === 'POST /identidad/verificar')?.cuerpo).toEqual(
      IDENTIDAD_PRUEBA,
    );

    await usuario.type(codigo, '123456');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await screen.findByRole('heading', { name: 'Solicitud de licencia' }),
    ).toBeInTheDocument();
    expect(llamadas.find((l) => l.clave === 'POST /identidad/verificar-otp')?.cuerpo).toEqual({
      desafioId: DESAFIO_PRUEBA.desafioId,
      codigo: '123456',
    });
  });

  it('el título del paso 1 recibe el foco al entrar', async () => {
    simularApi(baseTramite);
    montarEn('/tramite/identidad?licencia=LIC-02');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Paso 1 de 2: tus datos' })).toHaveFocus();
    });
  });

  it('con datos que no coinciden muestra un mensaje único', async () => {
    await enviarDatos({
      'POST /identidad/verificar': () =>
        json({ status: 422, errores: [{ campo: 'identidad', mensaje: 'x' }] }, 422),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/);
  });

  it('un formato inválido se marca en su campo', async () => {
    await enviarDatos({
      'POST /identidad/verificar': () =>
        json({ status: 422, errores: [{ campo: 'celular', mensaje: 'Celular no válido' }] }, 422),
    });

    expect(await screen.findByText('Celular no válido')).toBeInTheDocument();
    expect(screen.getByLabelText('Celular', { exact: false })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('si el servicio de identificación no responde sugiere mesa de partes', async () => {
    await enviarDatos({
      'POST /identidad/verificar': () => problema(503, 'identificacion-no-disponible'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/mesa de partes/);
  });

  it('con demasiados intentos muestra la hora para reintentar', async () => {
    await enviarDatos({
      'POST /identidad/verificar': () =>
        problema(429, 'demasiados-intentos', { 'Retry-After': '600' }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Puedes volver a intentarlo a las \d{2}:\d{2}/,
    );
  });

  it('un código incorrecto muestra el error sin salir del paso 2', async () => {
    const { usuario } = await enviarDatos({
      'POST /identidad/verificar': () => json(DESAFIO_PRUEBA),
      'POST /identidad/verificar-otp': () => problema(401, 'no-autenticado'),
    });

    await usuario.type(await screen.findByLabelText('Código de verificación'), '000000');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrecto/);
    expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument();
  });

  it('"Enviar otro código" reenvía los mismos datos y muestra el 429 con la hora', async () => {
    let envios = 0;
    const { llamadas, usuario } = await enviarDatos({
      'POST /identidad/verificar': () => {
        envios += 1;
        return envios === 1
          ? json(DESAFIO_PRUEBA)
          : problema(429, 'demasiados-intentos', { 'Retry-After': '300' });
      },
    });

    await usuario.click(await screen.findByRole('button', { name: 'Enviar otro código' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/a las \d{2}:\d{2}/);
    const envíos = llamadas.filter((l) => l.clave === 'POST /identidad/verificar');
    expect(envíos).toHaveLength(2);
    expect(envíos[1]?.cuerpo).toEqual(envíos[0]?.cuerpo);
  });

  it('"Enviar otro código" correcto avisa del nuevo envío', async () => {
    const { usuario } = await enviarDatos({
      'POST /identidad/verificar': () => json(DESAFIO_PRUEBA),
    });

    await usuario.click(await screen.findByRole('button', { name: 'Enviar otro código' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Te enviamos otro código/);
  });

  it('con carné de extranjería no pide fecha; con representante envía sus datos', async () => {
    const llamadas = simularApi({
      ...baseTramite,
      'POST /identidad/verificar': () => json(DESAFIO_PRUEBA),
    });
    montarEn('/tramite/identidad?licencia=LIC-02');
    const usuario = userEvent.setup();
    await screen.findByText('Licencia de funcionamiento – riesgo medio');

    const [tipoTitular] = screen.getAllByLabelText('Tipo de documento');
    await usuario.selectOptions(tipoTitular as HTMLElement, 'CE');
    expect(screen.queryByLabelText('Fecha de emisión del DNI')).not.toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Número de documento'), '000123456');
    await usuario.type(screen.getByLabelText('RUC'), '15000123456');
    await usuario.type(screen.getByLabelText('Celular', { exact: false }), '987000002');
    await usuario.click(screen.getByLabelText('Actúo como representante legal o apoderado'));
    const numeros = screen.getAllByLabelText('Número de documento');
    await usuario.type(numeros[1] as HTMLElement, '40000002');
    await usuario.type(screen.getByLabelText('Fecha de emisión del DNI'), '2019-05-10');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));

    await screen.findByLabelText('Código de verificación');
    expect(llamadas.find((l) => l.clave === 'POST /identidad/verificar')?.cuerpo).toEqual({
      tipoDocumento: 'CE',
      numeroDocumento: '000123456',
      ruc: '15000123456',
      celular: '987000002',
      representante: {
        tipoDocumento: 'DNI',
        numeroDocumento: '40000002',
        fechaEmision: '2019-05-10',
      },
    });
  });

  it('sin licencia válida muestra el selector y exige elegir una', async () => {
    const llamadas = simularApi(baseTramite);
    montarEn('/tramite/identidad?licencia=TRF-01');
    const usuario = userEvent.setup();

    const selector = await screen.findByLabelText('Licencia que solicitas');
    expect(
      within(selector)
        .getAllByRole('option')
        .map((opcion) => opcion.textContent),
    ).toEqual([
      'Elige una licencia',
      'Licencia de funcionamiento – riesgo medio',
      'Licencia provisional para bodegas',
    ]);
    await llenarTitular(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByText('Elige la licencia que solicitas')).toBeInTheDocument();
    expect(selector).toHaveAttribute('aria-invalid', 'true');
    expect(llamadas.some((l) => l.clave === 'POST /identidad/verificar')).toBe(false);

    await usuario.selectOptions(selector, 'LIC-09');
    expect(selector).toHaveValue('LIC-09');
  });

  it('si el catálogo no carga lo avisa', async () => {
    simularApi({ ...baseTramite, 'GET /catalogo/recetas': () => problema(503, 'no-disponible') });
    montarEn('/tramite/identidad');

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/);
  });

  it('"Corregir mis datos" vuelve al paso 1 con lo escrito', async () => {
    const { usuario } = await enviarDatos({
      'POST /identidad/verificar': () => json(DESAFIO_PRUEBA),
    });

    await usuario.click(await screen.findByRole('button', { name: 'Corregir mis datos' }));

    expect(await screen.findByLabelText('Número de documento')).toHaveValue('40000001');
  });
});
