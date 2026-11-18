import { AsignacionRol } from './asignacion-rol';
import type { Celular } from './celular';
import type { Correo } from './correo';
import { ErrorDominio } from './error-dominio';
import type { NombreCompleto } from './nombre-completo';
import type { Rol } from './rol';

export interface DatosNuevoUsuario {
  readonly id: string;
  readonly correo: Correo;
  readonly nombreCompleto: NombreCompleto;
  readonly celular: Celular;
  readonly claveHash: string;
  readonly roles: readonly Rol[];
  readonly asignadoPor: string;
  readonly en: Date;
}

export interface DatosUsuario {
  readonly id: string;
  readonly correo: Correo;
  readonly nombreCompleto: NombreCompleto;
  readonly celular: Celular;
  readonly claveHash: string;
  readonly debeCambiarClave: boolean;
  readonly activo: boolean;
  readonly versionSeguridad: number;
  /** Asignaciones vigentes (las retiradas solo se leen para consultar el historial). */
  readonly asignaciones: readonly AsignacionRol[];
}

export interface CambiosDeRoles {
  readonly retirados: Rol[];
  readonly creados: Rol[];
}

/**
 * Usuario del personal municipal (agregado raíz del módulo Seguridad). La versión de seguridad
 * aumenta cada vez que un token ya emitido debe volver a evaluarse: al desactivar, cambiar roles,
 * asignar una clave temporal o cambiar la clave (research.md §R-07).
 */
export class Usuario {
  private constructor(
    readonly id: string,
    readonly correo: Correo,
    private nombre: NombreCompleto,
    private celularActual: Celular,
    private huella: string,
    private claveTemporal: boolean,
    private estaActivo: boolean,
    private version: number,
    private readonly listaAsignaciones: AsignacionRol[],
  ) {}

  static crear(datos: DatosNuevoUsuario): Usuario {
    const roles = [...new Set(datos.roles)];
    if (roles.length === 0) {
      throw new ErrorDominio('El usuario debe tener al menos un rol');
    }
    return new Usuario(
      datos.id,
      datos.correo,
      datos.nombreCompleto,
      datos.celular,
      datos.claveHash,
      true,
      true,
      1,
      roles.map((rol) => AsignacionRol.nueva(rol, datos.asignadoPor, datos.en)),
    );
  }

  static reconstruir(datos: DatosUsuario): Usuario {
    return new Usuario(
      datos.id,
      datos.correo,
      datos.nombreCompleto,
      datos.celular,
      datos.claveHash,
      datos.debeCambiarClave,
      datos.activo,
      datos.versionSeguridad,
      [...datos.asignaciones],
    );
  }

  get nombreCompleto(): NombreCompleto {
    return this.nombre;
  }
  get celular(): Celular {
    return this.celularActual;
  }
  get claveHash(): string {
    return this.huella;
  }
  get debeCambiarClave(): boolean {
    return this.claveTemporal;
  }
  get activo(): boolean {
    return this.estaActivo;
  }
  get versionSeguridad(): number {
    return this.version;
  }
  get asignaciones(): readonly AsignacionRol[] {
    return this.listaAsignaciones;
  }
  get rolesVigentes(): Rol[] {
    return this.listaAsignaciones.filter((a) => a.esVigente).map((a) => a.rol);
  }

  tieneRol(rol: Rol): boolean {
    return this.rolesVigentes.includes(rol);
  }

  cambiarNombre(nombre: NombreCompleto): void {
    this.nombre = nombre;
  }

  cambiarCelular(celular: Celular): void {
    this.celularActual = celular;
  }

  desactivar(): void {
    if (!this.estaActivo) {
      return;
    }
    this.estaActivo = false;
    this.version += 1;
  }

  reactivar(): void {
    this.estaActivo = true;
  }

  asignarClaveTemporal(huella: string): void {
    this.huella = huella;
    this.claveTemporal = true;
    this.version += 1;
  }

  cambiarClave(huella: string): void {
    this.huella = huella;
    this.claveTemporal = false;
    this.version += 1;
  }

  /** Deja vigentes exactamente `roles`: retira los demás y crea los que falten (FR-019). */
  reemplazarRoles(roles: readonly Rol[], porUsuarioId: string, en: Date): CambiosDeRoles {
    const deseados = new Set(roles);
    if (deseados.size === 0) {
      throw new ErrorDominio('El usuario debe tener al menos un rol');
    }

    const vigentes = this.listaAsignaciones.filter((a) => a.esVigente);
    const retirados: Rol[] = [];
    for (const asignacion of vigentes) {
      if (!deseados.has(asignacion.rol)) {
        asignacion.retirar(porUsuarioId, en);
        retirados.push(asignacion.rol);
      }
    }

    const yaVigentes = new Set(vigentes.map((a) => a.rol));
    const creados = [...deseados].filter((rol) => !yaVigentes.has(rol));
    for (const rol of creados) {
      this.listaAsignaciones.push(AsignacionRol.nueva(rol, porUsuarioId, en));
    }

    if (retirados.length > 0 || creados.length > 0) {
      this.version += 1;
    }
    return { retirados, creados };
  }
}
