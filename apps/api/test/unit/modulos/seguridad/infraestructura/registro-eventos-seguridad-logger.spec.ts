import { Logger } from '@nestjs/common';
import { RegistroEventosSeguridadLogger } from '../../../../../src/modulos/seguridad/infraestructura/registro-eventos-seguridad-logger';
import { RelojSistema } from '../../../../../src/modulos/seguridad/infraestructura/reloj-sistema';

describe('RegistroEventosSeguridadLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('escribe solo el nombre del evento y los identificadores internos', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    new RegistroEventosSeguridadLogger().registrar('inicio-sesion-exitoso', {
      usuarioId: 'u-1',
      sesionId: 's-1',
    });

    expect(log).toHaveBeenCalledWith('evento=inicio-sesion-exitoso usuarioId=u-1 sesionId=s-1');
  });

  it('sin identificadores escribe solo el evento', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    new RegistroEventosSeguridadLogger().registrar('inicio-sesion-fallido');

    expect(log).toHaveBeenCalledWith('evento=inicio-sesion-fallido');
  });

  it.each(['bloqueo-temporal', 'reutilizacion-refresh', 'fallo-cache-seguridad'] as const)(
    'registra %s como advertencia',
    (evento) => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      new RegistroEventosSeguridadLogger().registrar(evento, { usuarioId: 'u-1' });

      expect(warn).toHaveBeenCalledWith(`evento=${evento} usuarioId=u-1`);
    },
  );
});

describe('RelojSistema', () => {
  it('devuelve la hora actual', () => {
    const antes = Date.now();
    const ahora = new RelojSistema().ahora().getTime();

    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(Date.now());
  });
});
