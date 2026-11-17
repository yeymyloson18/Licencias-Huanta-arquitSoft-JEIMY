import { ErrorDominio } from './error-dominio';

// Monto en soles con 2 decimales como máximo, sin signo ni separadores de miles.
const FORMATO_SOLES = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Tasa del TUPA en soles (data-model.md §1). Se guarda en céntimos enteros para no perder
 * precisión; 0 significa gratuito (LIC-09). Se expone como texto "159.50" (esquema `Soles`).
 */
export class Tasa {
  private constructor(readonly centimos: number) {}

  static desdeCentimos(centimos: number): Tasa {
    if (!Number.isSafeInteger(centimos) || centimos < 0) {
      throw new ErrorDominio('La tasa debe ser un número entero de céntimos mayor o igual a 0');
    }
    return new Tasa(centimos);
  }

  static desdeTexto(texto: string): Tasa {
    const coincidencia = FORMATO_SOLES.exec(texto);
    if (!coincidencia) {
      throw new ErrorDominio(`Tasa inválida: "${texto}" (se espera un monto como 159.50)`);
    }
    const soles = Number(coincidencia[1]);
    const centimos = Number((coincidencia[2] ?? '').padEnd(2, '0'));
    return Tasa.desdeCentimos(soles * 100 + centimos);
  }

  esGratuita(): boolean {
    return this.centimos === 0;
  }

  esIgualA(otra: Tasa): boolean {
    return this.centimos === otra.centimos;
  }

  aTextoSoles(): string {
    const soles = Math.floor(this.centimos / 100);
    const centimos = this.centimos % 100;
    return `${String(soles)}.${String(centimos).padStart(2, '0')}`;
  }
}
