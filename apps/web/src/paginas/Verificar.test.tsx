import { screen } from '@testing-library/react';
import { json, problema, simularApi } from '../pruebas/api-simulada';
import { montarEn } from '../pruebas/montar';
import { reiniciarSesion } from '../sesion/almacen-sesion';

// Datos FICTICIOS con la forma del contrato (LicenciaPublica de la 006).
const CODIGO = 'AbCdEfGhIjKlMnOpQrStUv';
const LICENCIA = {
  numero: 'LF-2026-000001',
  tipo: 'DEFINITIVA',
  estado: 'VIGENTE',
  titular: 'Juana P. Q.',
  nombreComercial: 'Bodega Doña Juana',
  giro: 'Bodega',
  zona: 'Centro',
  emitidaEn: '2026-11-20',
  vigenteHasta: null,
  itseVenceEn: '2028-11-19',
  itseEstado: 'VIGENTE',
};

const montar = (respuesta: () => Response) => {
  const llamadas = simularApi({
    'POST /auth/renovar': () => problema(401, 'no-autenticado'),
    [`GET /licencias/verificar/${CODIGO}`]: respuesta,
  });
  montarEn(`/verificar/${CODIGO}`);
  return llamadas;
};

const dato = (etiqueta: string) =>
  screen
    .getByText(etiqueta, { selector: 'dt' })
    .nextElementSibling?.textContent.replace(/\s/g, ' ');

describe('Página Verificar (006)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra los datos mínimos de una licencia vigente, sin cuenta', async () => {
    const llamadas = montar(() => json(LICENCIA));

    expect(await screen.findByRole('heading', { name: 'LF-2026-000001' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Licencia vigente');
    expect(dato('Titular')).toBe('Juana P. Q.');
    expect(dato('Giro')).toBe('Bodega');
    expect(dato('Vigencia')).toBe('Indeterminada');
    expect(dato('Certificado ITSE')).toBe('Vigente (vence el 19 de noviembre de 2028)');
    expect(llamadas.find((l) => l.clave.startsWith('GET /licencias'))?.autorizacion).toBeNull();
  });

  it('una provisional vencida lo dice', async () => {
    montar(() =>
      json({
        ...LICENCIA,
        tipo: 'PROVISIONAL',
        estado: 'VENCIDA',
        vigenteHasta: '2026-01-01',
        itseEstado: 'SIN_CERTIFICADO',
        itseVenceEn: null,
      }),
    );

    await screen.findByRole('heading', { name: 'LF-2026-000001' });
    expect(screen.getByRole('status')).toHaveTextContent('Licencia vencida');
    expect(dato('Tipo')).toBe('Provisional');
    expect(dato('Vigencia')).toBe('Hasta el 1 de enero de 2026');
    expect(dato('Certificado ITSE')).toBe('Sin certificado registrado');
  });

  it('un código que no existe muestra un mensaje sin pistas', async () => {
    montar(() => problema(404, 'no-encontrado'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No encontramos una licencia con ese código.',
    );
  });

  it('con demasiados intentos indica cuándo reintentar; si falla, lo dice', async () => {
    montar(() => new Response('{}', { status: 429, headers: { 'Retry-After': '600' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
  });

  it('si el servicio no responde lo dice sin detalles técnicos', async () => {
    montar(() => problema(503, 'servicio-no-disponible'));
    expect(await screen.findByRole('alert')).toHaveTextContent('no está disponible');
  });
});
