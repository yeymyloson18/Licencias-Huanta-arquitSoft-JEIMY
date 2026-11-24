import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reiniciarSesion } from '../sesion/almacen-sesion';
import { json, sesionDePrueba, simularApi } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';

const conClaveTemporal = () => json(sesionDePrueba({ debeCambiarClave: true }));

const completar = async (actual: string, nueva: string, repetir: string) => {
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Clave actual'), actual);
  await usuario.type(screen.getByLabelText('Clave nueva'), nueva);
  await usuario.type(screen.getByLabelText('Repetir clave nueva'), repetir);
  await usuario.click(screen.getByRole('button', { name: 'Cambiar clave' }));
};

describe('Página CambiarClave', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra la política de clave', async () => {
    simularApi({ 'POST /auth/renovar': conClaveTemporal });
    montarEn('/cambiar-clave');

    expect(
      await screen.findByText('Al menos 12 caracteres, con letras y números.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Clave nueva')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('las dos claves nuevas deben coincidir (sin llamar a la API)', async () => {
    const llamadas = simularApi({ 'POST /auth/renovar': conClaveTemporal });
    montarEn('/cambiar-clave');

    await completar('ClaveTemporal2026', 'ClaveDefinitiva2026', 'OtraDistinta2026');

    expect(await screen.findByText('Las claves nuevas no coinciden')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave === 'POST /auth/cambiar-clave')).toBe(false);
  });

  it('muestra los errores del 422 junto al campo', async () => {
    simularApi({
      'POST /auth/renovar': conClaveTemporal,
      'POST /auth/cambiar-clave': () =>
        json(
          {
            type: 'https://licencias.example.pe/errores/validacion',
            title: 'Los datos no cumplen las reglas de validación',
            status: 422,
            errores: [{ campo: 'claveNueva', mensaje: 'Debe incluir al menos un número' }],
          },
          422,
        ),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveTemporal2026', 'SoloLetrasLargas', 'SoloLetrasLargas');

    expect(await screen.findByText('Debe incluir al menos un número')).toBeInTheDocument();
    expect(screen.getByLabelText('Clave nueva')).toHaveAttribute('aria-invalid', 'true');
  });

  it('envía el token y, al terminar, va a / con "Su clave se cambió"', async () => {
    const llamadas = simularApi({
      'POST /auth/renovar': conClaveTemporal,
      'POST /auth/cambiar-clave': () => json(sesionDePrueba({}, 'token-2')),
      'GET /catalogo/recetas': () => json([]),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveTemporal2026', 'ClaveDefinitiva2026', 'ClaveDefinitiva2026');

    expect(await screen.findByText('Su clave se cambió')).toBeInTheDocument();
    const cambio = llamadas.find((l) => l.clave === 'POST /auth/cambiar-clave');
    expect(cambio?.autorizacion).toBe('Bearer token-1');
    expect(cambio?.cuerpo).toEqual({
      claveActual: 'ClaveTemporal2026',
      claveNueva: 'ClaveDefinitiva2026',
    });
  });

  it('el administrador, al terminar, va a su panel (009)', async () => {
    simularApi({
      'POST /auth/renovar': conClaveTemporal,
      'POST /auth/cambiar-clave': () =>
        json(sesionDePrueba({ roles: ['ADMINISTRADOR'] }, 'token-2')),
      'GET /catalogo/recetas': () => json([]),
      'GET /admin/panel': () => json({}, 503),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveTemporal2026', 'ClaveDefinitiva2026', 'ClaveDefinitiva2026');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panel del administrador' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Su clave se cambió')).toBeInTheDocument();
  });

  it('sin sesión lleva a /ingresar', async () => {
    simularApi({ 'POST /auth/renovar': () => new Response(null, { status: 401 }) });
    montarEn('/cambiar-clave');

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });
});
