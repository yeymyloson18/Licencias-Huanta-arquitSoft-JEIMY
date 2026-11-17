import { ArgumentsHost, HttpException, Logger, NotFoundException } from '@nestjs/common';
import {
  aProblema,
  ErrorValidacion,
  FiltroProblema,
} from '../../../src/compartido/presentacion/filtro-problema';

const crearHost = () => {
  const respuesta = {
    codigo: 0,
    tipo: '',
    cuerpo: '',
    status(codigo: number) {
      this.codigo = codigo;
      return this;
    },
    type(tipo: string) {
      this.tipo = tipo;
      return this;
    },
    send(cuerpo: string) {
      this.cuerpo = cuerpo;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => respuesta }),
  } as unknown as ArgumentsHost;
  return { host, respuesta };
};

describe('aProblema', () => {
  it('traduce ErrorValidacion a 422 con la lista de errores', () => {
    const problema = aProblema(
      new ErrorValidacion([{ campo: 'tipo', mensaje: 'Valor no válido' }]),
    );

    expect(problema.status).toBe(422);
    expect(problema.errores).toEqual([{ campo: 'tipo', mensaje: 'Valor no válido' }]);
    expect(problema.type).toMatch(/^https:\/\//);
  });

  it('traduce una HttpException 4xx conservando el código y sin detalles internos', () => {
    const problema = aProblema(new NotFoundException('Cannot GET /api/v1/ruta-interna'));

    expect(problema).toEqual({ type: 'about:blank', title: 'Recurso no encontrado', status: 404 });
  });

  it('usa un título genérico para códigos 4xx sin título propio', () => {
    expect(aProblema(new HttpException('x', 418)).title).toBe('Solicitud no procesada');
  });

  it('oculta los errores no controlados y las HttpException 5xx detrás de un 500 genérico', () => {
    const esperado = { type: 'about:blank', title: 'Error interno del servidor', status: 500 };

    expect(aProblema(new Error('connect ECONNREFUSED postgresql://usuario:clave@db'))).toEqual(
      esperado,
    );
    expect(aProblema(new HttpException('fallo interno', 502))).toEqual(esperado);
    expect(aProblema('texto')).toEqual(esperado);
  });

  it('no incluye errores fuera de un 422', () => {
    expect(aProblema(new NotFoundException()).errores).toBeUndefined();
  });
});

describe('FiltroProblema', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('responde application/problem+json con el código del problema', () => {
    const { host, respuesta } = crearHost();

    new FiltroProblema().catch(new ErrorValidacion([{ campo: 'tipo', mensaje: 'x' }]), host);

    expect(respuesta.codigo).toBe(422);
    expect(respuesta.tipo).toBe('application/problem+json');
    expect(JSON.parse(respuesta.cuerpo)).toMatchObject({
      status: 422,
      errores: [{ campo: 'tipo' }],
    });
  });

  it('registra los 500 sin el mensaje original', () => {
    const { host, respuesta } = crearHost();
    const error = jest.spyOn(Logger.prototype, 'error');

    new FiltroProblema().catch(new Error('clave=secreta'), host);

    expect(respuesta.codigo).toBe(500);
    expect(respuesta.cuerpo).not.toContain('secreta');
    expect(error).toHaveBeenCalledWith('Error no controlado (Error)');
  });
});
