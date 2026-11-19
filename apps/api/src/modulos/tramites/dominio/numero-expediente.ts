import { ErrorDominio } from './error-dominio';

// Número de expediente EXP-AAAA-NNNNNN (FR-016): año de presentación y un correlativo único de 6
// cifras que nunca se reinicia, ni al cambiar de año (aclaración 4 de la 004).
const PATRON = /^EXP-[0-9]{4}-[0-9]{6}$/;
const CORRELATIVO_MAXIMO = 999_999;

export class NumeroExpediente {
  private constructor(readonly valor: string) {}

  /** Arma el número a partir del año y el correlativo de la secuencia. */
  static crear(anio: number, correlativo: number): NumeroExpediente {
    if (!Number.isInteger(anio) || anio < 1000 || anio > 9999) {
      throw new ErrorDominio('El año del expediente debe tener 4 cifras');
    }
    if (!Number.isInteger(correlativo) || correlativo < 1 || correlativo > CORRELATIVO_MAXIMO) {
      throw new ErrorDominio('El correlativo del expediente debe estar entre 1 y 999999');
    }
    return new NumeroExpediente(`EXP-${String(anio)}-${String(correlativo).padStart(6, '0')}`);
  }

  /** Acepta espacios al inicio y al final y minúsculas (consulta pública). */
  static normalizar(texto: string): NumeroExpediente {
    const valor = texto.trim().toUpperCase();
    if (!PATRON.test(valor)) {
      throw new ErrorDominio('El número de expediente debe tener el formato EXP-AAAA-NNNNNN');
    }
    return new NumeroExpediente(valor);
  }

  esIgualA(otro: NumeroExpediente): boolean {
    return this.valor === otro.valor;
  }
}
