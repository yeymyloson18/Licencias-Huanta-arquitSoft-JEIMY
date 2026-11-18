import { ErrorDominio } from './error-dominio';

const MINIMO = 3;
const MAXIMO = 150;

/** Nombre completo del personal: 3 a 150 caracteres, sin espacios al inicio o al final. */
export class NombreCompleto {
  private constructor(readonly valor: string) {}

  static crear(texto: string): NombreCompleto {
    const limpio = texto.trim();
    if (limpio.length < MINIMO || limpio.length > MAXIMO) {
      throw new ErrorDominio('El nombre completo debe tener entre 3 y 150 caracteres');
    }
    return new NombreCompleto(limpio);
  }
}
