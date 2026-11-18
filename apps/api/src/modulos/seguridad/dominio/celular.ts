import { ErrorDominio } from './error-dominio';

const FORMATO = /^9[0-9]{8}$/;

/** Celular móvil del Perú donde se envía el código (FR-028): 9 dígitos que empiezan con 9. */
export class Celular {
  private constructor(readonly valor: string) {}

  static crear(texto: string): Celular {
    if (!FORMATO.test(texto)) {
      throw new ErrorDominio('El celular debe tener 9 dígitos y empezar con 9');
    }
    return new Celular(texto);
  }

  /** Forma que se muestra fuera del sistema: primer dígito y los tres últimos (`9*****321`). */
  enmascarado(): string {
    return `${this.valor.slice(0, 1)}*****${this.valor.slice(-3)}`;
  }
}
