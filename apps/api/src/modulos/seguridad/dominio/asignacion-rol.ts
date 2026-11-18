import { ErrorDominio } from './error-dominio';
import type { Rol } from './rol';

export interface DatosAsignacionRol {
  /** `undefined` mientras la asignación no se ha guardado (la base genera el id). */
  readonly id?: string;
  readonly rol: Rol;
  readonly asignadoPor: string;
  readonly asignadoEn: Date;
  readonly retiradoPor?: string;
  readonly retiradoEn?: Date;
}

/**
 * Asignación de un rol a un usuario (FR-019). Estados: vigente → retirada (terminal). Quién retiró y
 * cuándo son ambos nulos (vigente) o ambos con valor (retirada).
 */
export class AsignacionRol {
  private retiro: { readonly por: string; readonly en: Date } | undefined;

  private constructor(private readonly datos: DatosAsignacionRol) {
    if ((datos.retiradoPor === undefined) !== (datos.retiradoEn === undefined)) {
      throw new ErrorDominio('Una asignación retirada debe indicar quién la retiró y cuándo');
    }
    this.retiro =
      datos.retiradoPor !== undefined && datos.retiradoEn !== undefined
        ? { por: datos.retiradoPor, en: datos.retiradoEn }
        : undefined;
  }

  static nueva(rol: Rol, asignadoPor: string, asignadoEn: Date): AsignacionRol {
    return new AsignacionRol({ rol, asignadoPor, asignadoEn });
  }

  static reconstruir(datos: DatosAsignacionRol): AsignacionRol {
    return new AsignacionRol(datos);
  }

  get id(): string | undefined {
    return this.datos.id;
  }
  get rol(): Rol {
    return this.datos.rol;
  }
  get asignadoPor(): string {
    return this.datos.asignadoPor;
  }
  get asignadoEn(): Date {
    return this.datos.asignadoEn;
  }
  get retiradoPor(): string | undefined {
    return this.retiro?.por;
  }
  get retiradoEn(): Date | undefined {
    return this.retiro?.en;
  }
  get esVigente(): boolean {
    return this.retiro === undefined;
  }

  retirar(por: string, en: Date): void {
    if (this.retiro !== undefined) {
      throw new ErrorDominio('La asignación ya fue retirada');
    }
    this.retiro = { por, en };
  }
}
