import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reiniciarSesion } from '../sesion/almacen-sesion';
import {
  json,
  problema,
  sesionDePrueba,
  simularApi,
  type Manejador,
} from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';

const desafio = {
  desafioId: '00000000-0000-4000-8000-0000000000d1',
  venceEn: '2026-11-17T10:05:00.000Z',
  celularEnmascarado: '9*****321',
};

const base: Record<string, Manejador> = {
  'POST /auth/renovar': () => problema(401, 'no-autenticado'),
  'GET /catalogo/recetas': () => json([]),
};

const completarPaso1 = async () => {
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Correo'), 'persona@ejemplo.pe');
  await usuario.type(screen.getByLabelText('Clave'), 'ClaveActual2026');
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
  return usuario;
};

describe('Página Ingresar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('paso 1 → paso 2 con el celular enmascarado', async () => {
    const llamadas = simularApi({ ...base, 'POST /auth/iniciar-sesion': () => json(desafio) });
    montarEn('/ingresar');

    await completarPaso1();

    expect(await screen.findByText('Enviamos un código al celular 9*****321')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByLabelText('Código')).toHaveAttribute('inputmode', 'numeric');
    expect(llamadas.find((l) => l.clave === 'POST /auth/iniciar-sesion')?.cuerpo).toEqual({
      correo: 'persona@ejemplo.pe',
      clave: 'ClaveActual2026',
    });
  });

  it('usa los autocompletados correctos en el paso 1', async () => {
    simularApi(base);
    montarEn('/ingresar');

    expect(await screen.findByLabelText('Correo')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Clave')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Clave')).toHaveAttribute('type', 'password');
  });

  it('un 401 muestra "Correo, clave o código incorrectos."', async () => {
    simularApi({ ...base, 'POST /auth/iniciar-sesion': () => problema(401, 'no-autenticado') });
    montarEn('/ingresar');

    await completarPaso1();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo, clave o código incorrectos.',
    );
  });

  it('un 429 muestra la hora de reintento calculada con Retry-After', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 17, 10, 0, 0).getTime());
    simularApi({
      ...base,
      'POST /auth/iniciar-sesion': () =>
        problema(429, 'demasiados-intentos', { 'Retry-After': '900' }),
    });
    montarEn('/ingresar');

    await completarPaso1();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Puede volver a intentarlo a las 10:15.',
    );
  });

  it('un 503 muestra que el inicio de sesión no está disponible', async () => {
    simularApi({
      ...base,
      'POST /auth/iniciar-sesion': () => problema(503, 'servicio-no-disponible'),
    });
    montarEn('/ingresar');

    await completarPaso1();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El inicio de sesión no está disponible en este momento. Inténtelo en unos minutos.',
    );
  });

  it('"Enviar otro código" repite el paso 1', async () => {
    const llamadas = simularApi({ ...base, 'POST /auth/iniciar-sesion': () => json(desafio) });
    montarEn('/ingresar');
    const usuario = await completarPaso1();
    await screen.findByLabelText('Código');

    await usuario.click(screen.getByRole('button', { name: 'Enviar otro código' }));

    await waitFor(() => {
      expect(llamadas.filter((l) => l.clave === 'POST /auth/iniciar-sesion')).toHaveLength(2);
    });
  });

  it('con el código correcto entra y va al inicio', async () => {
    simularApi({
      ...base,
      'POST /auth/iniciar-sesion': () => json(desafio),
      'POST /auth/verificar-otp': () => json(sesionDePrueba()),
    });
    montarEn('/ingresar');
    const usuario = await completarPaso1();

    await usuario.type(await screen.findByLabelText('Código'), '123456');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/licencia/i);
  });

  it('el administrador entra directo a su panel (009)', async () => {
    simularApi({
      ...base,
      'POST /auth/iniciar-sesion': () => json(desafio),
      'POST /auth/verificar-otp': () => json(sesionDePrueba({ roles: ['ADMINISTRADOR'] })),
      'GET /admin/panel': () => problema(503, 'servicio-no-disponible'),
    });
    montarEn('/ingresar');
    const usuario = await completarPaso1();

    await usuario.type(await screen.findByLabelText('Código'), '123456');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panel del administrador' }),
    ).toBeInTheDocument();
  });

  it('con clave temporal navega a /cambiar-clave', async () => {
    simularApi({
      ...base,
      'POST /auth/iniciar-sesion': () => json(desafio),
      'POST /auth/verificar-otp': () => json(sesionDePrueba({ debeCambiarClave: true })),
    });
    montarEn('/ingresar');
    const usuario = await completarPaso1();

    await usuario.type(await screen.findByLabelText('Código'), '123456');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByLabelText('Clave nueva')).toBeInTheDocument();
  });

  it('un código incorrecto muestra el mismo mensaje y permite volver', async () => {
    simularApi({
      ...base,
      'POST /auth/iniciar-sesion': () => json(desafio),
      'POST /auth/verificar-otp': () => problema(401, 'no-autenticado'),
    });
    montarEn('/ingresar');
    const usuario = await completarPaso1();

    await usuario.type(await screen.findByLabelText('Código'), '000000');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo, clave o código incorrectos.',
    );

    await usuario.click(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByLabelText('Clave')).toHaveValue('');
  });
});
