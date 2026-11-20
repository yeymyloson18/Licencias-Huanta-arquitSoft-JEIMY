import { ErrorDatoPagos } from './errores';

const PATRON = /^[A-Z0-9-]{4,30}$/;

/**
 * Número de recibo de caja (FR-023 de la 005): de 4 a 30 caracteres con letras, números y guiones.
 * Se normaliza a mayúsculas y sin espacios antes de validar.
 */
export class NumeroRecibo {
  private constructor(readonly valor: string) {}

  static crear(texto: string): NumeroRecibo {
    const valor = texto.replace(/\s+/g, '').toUpperCase();
    if (!PATRON.test(valor)) {
      throw new ErrorDatoPagos(
        'numeroRecibo',
        'El número de recibo debe tener de 4 a 30 letras, números o guiones',
      );
    }
    return new NumeroRecibo(valor);
  }
}
