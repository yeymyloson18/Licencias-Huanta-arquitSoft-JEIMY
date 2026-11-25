import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reiniciarSesion } from '../sesion/almacen-sesion';
import { json, problema, sesionDePrueba, simularApi } from '../pruebas/api-simulada';
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

  it('envía el token y, al terminar, CAJA va a su pantalla con "Su clave se cambió" (011)', async () => {
    const llamadas = simularApi({
      'POST /auth/renovar': conClaveTemporal,
      'POST /auth/cambiar-clave': () => json(sesionDePrueba({}, 'token-2')),
      'GET /catalogo/recetas': () => json([]),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveTemporal2026', 'ClaveDefinitiva2026', 'ClaveDefinitiva2026');

    expect(await screen.findByRole('heading', { level: 1, name: 'Caja' })).toBeInTheDocument();
    expect(screen.getByText('Su clave se cambió')).toBeInTheDocument();
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

  it('con clave temporal, el INSPECTOR termina en Inspecciones con el aviso (011)', async () => {
    simularApi({
      'POST /auth/renovar': () =>
        json(sesionDePrueba({ debeCambiarClave: true, roles: ['INSPECTOR'] })),
      'POST /auth/cambiar-clave': () => json(sesionDePrueba({ roles: ['INSPECTOR'] }, 'token-2')),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveTemporal2026', 'ClaveDefinitiva2026', 'ClaveDefinitiva2026');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Inspecciones ITSE' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Su clave se cambió')).toBeInTheDocument();
  });

  it('sin sesión lleva a /ingresar', async () => {
    simularApi({ 'POST /auth/renovar': () => new Response(null, { status: 401 }) });
    montarEn('/cambiar-clave');

    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });
});

describe('CambiarClave voluntario desde Mi perfil (011, HU3)', () => {
  const PERFIL = {
    nombreCompleto: 'Persona de Prueba',
    correo: 'persona@ejemplo.pe',
    celularEnmascarado: '9*****321',
    roles: ['CAJA'],
    ultimoIngreso: null,
    sesionesAbiertas: 1,
  };
  const conClaveDefinitiva = () => json(sesionDePrueba());

  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra "Volver a mi perfil"', async () => {
    simularApi({ 'POST /auth/renovar': conClaveDefinitiva });
    montarEn('/cambiar-clave');

    expect(await screen.findByRole('link', { name: 'Volver a mi perfil' })).toHaveAttribute(
      'href',
      '/perfil',
    );
  });

  it('con clave temporal NO muestra "Volver a mi perfil"', async () => {
    simularApi({ 'POST /auth/renovar': conClaveTemporal });
    montarEn('/cambiar-clave');

    await screen.findByLabelText('Clave actual');
    expect(screen.queryByRole('link', { name: 'Volver a mi perfil' })).not.toBeInTheDocument();
  });

  it('un cambio correcto vuelve a Mi perfil con "Su clave se cambió"', async () => {
    simularApi({
      'POST /auth/renovar': conClaveDefinitiva,
      'POST /auth/cambiar-clave': () => json(sesionDePrueba({}, 'token-2')),
      'GET /perfil': () => json(PERFIL),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveActual2026', 'ClaveNuevaSegura2026', 'ClaveNuevaSegura2026');

    expect(await screen.findByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByText('Su clave se cambió')).toBeInTheDocument();
  });

  it('las claves nuevas distintas no llaman a la API', async () => {
    const llamadas = simularApi({ 'POST /auth/renovar': conClaveDefinitiva });
    montarEn('/cambiar-clave');

    await completar('ClaveActual2026', 'ClaveNuevaSegura2026', 'OtraDistinta2026');

    expect(await screen.findByText('Las claves nuevas no coinciden')).toBeInTheDocument();
    expect(llamadas.some((l) => l.clave === 'POST /auth/cambiar-clave')).toBe(false);
  });

  it('un 401 dice que la clave actual no es correcta', async () => {
    simularApi({
      'POST /auth/renovar': conClaveDefinitiva,
      'POST /auth/cambiar-clave': () => problema(401, 'no-autenticado'),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveErrada2026', 'ClaveNuevaSegura2026', 'ClaveNuevaSegura2026');

    expect(await screen.findByText('La clave actual no es correcta')).toBeInTheDocument();
    expect(screen.getByLabelText('Clave actual')).toHaveAttribute('aria-invalid', 'true');
  });

  it('un 429 dice que hubo demasiados intentos', async () => {
    simularApi({
      'POST /auth/renovar': conClaveDefinitiva,
      'POST /auth/cambiar-clave': () =>
        problema(429, 'demasiados-intentos', { 'Retry-After': '900' }),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveErrada2026', 'ClaveNuevaSegura2026', 'ClaveNuevaSegura2026');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Vuelva a intentarlo más tarde.',
    );
  });

  it('un 422 muestra la regla junto al campo y no sale de la pantalla', async () => {
    simularApi({
      'POST /auth/renovar': conClaveDefinitiva,
      'POST /auth/cambiar-clave': () =>
        json(
          {
            type: 'https://licencias.example.pe/errores/validacion',
            title: 'Los datos no cumplen las reglas de validación',
            status: 422,
            errores: [{ campo: 'claveNueva', mensaje: 'Debe ser distinta de la actual' }],
          },
          422,
        ),
    });
    montarEn('/cambiar-clave');

    await completar('ClaveActual2026', 'ClaveActual2026', 'ClaveActual2026');

    expect(await screen.findByText('Debe ser distinta de la actual')).toBeInTheDocument();
    expect(screen.getByLabelText('Clave nueva')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Cambiar clave' })).toBeInTheDocument();
  });
});
