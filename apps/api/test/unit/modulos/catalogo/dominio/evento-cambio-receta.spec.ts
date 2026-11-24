import {
  datosEventoCambioReceta,
  tipoEventoCambioReceta,
} from '../../../../../src/modulos/catalogo/dominio/evento-cambio-receta';

describe('Evento de cambio de receta (009)', () => {
  it('desactivar o reactivar da nombre al evento; lo demás es una actualización', () => {
    expect(tipoEventoCambioReceta({ activa: { antes: true, despues: false } })).toBe(
      'RecetaDesactivada',
    );
    expect(
      tipoEventoCambioReceta({
        activa: { antes: false, despues: true },
        tasa: { antes: '10.00', despues: '12.00' },
      }),
    ).toBe('RecetaReactivada');
    expect(tipoEventoCambioReceta({ tasa: { antes: '10.00', despues: '12.00' } })).toBe(
      'RecetaActualizada',
    );
  });

  it('los datos llevan el código, el id interno y la hora en ISO', () => {
    expect(datosEventoCambioReceta('LIC-01', 'admin-1', new Date('2026-11-23T15:00:00Z'))).toEqual({
      codigoReceta: 'LIC-01',
      usuarioId: 'admin-1',
      en: '2026-11-23T15:00:00.000Z',
    });
  });
});
