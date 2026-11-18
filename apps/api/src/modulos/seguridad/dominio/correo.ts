import { ErrorDominio } from './error-dominio';

const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MAXIMA = 120;

/** Correo del personal: normalizado a minúsculas y sin espacios; identifica al usuario (FR-017). */
export class Correo {
  private constructor(readonly valor: string) {}

  static crear(texto: string): Correo {
    const normalizado = texto.trim().toLowerCase();
    if (normalizado.length > LONGITUD_MAXIMA || !FORMATO.test(normalizado)) {
      throw new ErrorDominio('El correo no tiene un formato válido');
    }
    return new Correo(normalizado);
  }

  esIgualA(otro: Correo): boolean {
    return this.valor === otro.valor;
  }
}
