import { ErrorDominio } from './error-dominio';

// Códigos de las recetas del TUPA 2024 (esquema `CodigoReceta` del contrato).
const PATRON = /^(LIC-0[1-9]|TRF-01|CGI-01|DUP-01)$/;

export class CodigoReceta {
  private constructor(readonly valor: string) {}

  static crear(valor: string): CodigoReceta {
    if (!PATRON.test(valor)) {
      throw new ErrorDominio(`Código de receta inválido: "${valor}"`);
    }
    return new CodigoReceta(valor);
  }
}
