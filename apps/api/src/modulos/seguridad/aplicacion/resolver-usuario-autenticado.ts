import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { ReclamosAcceso } from '../dominio/puertos/emisor-tokens';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import type { Rol } from '../dominio/rol';
import { ErrorAutenticacion } from './errores';

export interface DependenciasResolverUsuarioAutenticado {
  readonly almacen: AlmacenVersionSeguridad;
  readonly usuarios: RepositorioUsuarios;
}

/** Quién hace la petición, con los roles y la marca de clave temporal que valen AHORA. */
export interface SesionResuelta {
  readonly usuarioId: string;
  readonly sesionId: string;
  readonly roles: readonly Rol[];
  readonly versionSeguridad: number;
  readonly debeCambiarClave: boolean;
}

/**
 * Decide qué vale de un token de acceso ya verificado (research.md §R-07):
 * - sesión marcada como revocada → no autenticado (FR-004);
 * - versión de la caché igual a la del token → los roles del token, sin consultar PostgreSQL
 *   (caso normal, EQ-01);
 * - en otro caso (versión distinta, sin clave en la caché o caché caída) → el estado actual de la
 *   base: usuario inactivo o sesión revocada → no autenticado (FR-011); si no, los roles vigentes,
 *   de modo que perder un rol responde 403 en la siguiente operación (FR-015).
 */
export class ResolverUsuarioAutenticado {
  constructor(private readonly d: DependenciasResolverUsuarioAutenticado) {}

  async ejecutar(reclamos: ReclamosAcceso): Promise<SesionResuelta> {
    const enCache = await this.d.almacen.leerEstado(reclamos.sub, reclamos.sid);
    if (enCache?.sesionRevocada === true) {
      throw new ErrorAutenticacion();
    }
    if (enCache !== null && enCache.version === reclamos.vs) {
      return {
        usuarioId: reclamos.sub,
        sesionId: reclamos.sid,
        roles: reclamos.roles,
        versionSeguridad: reclamos.vs,
        debeCambiarClave: reclamos.dcc,
      };
    }

    const estado = await this.d.usuarios.obtenerEstadoSeguridad(reclamos.sub, reclamos.sid);
    if (estado === null || !estado.activo || estado.sesionRevocada) {
      throw new ErrorAutenticacion();
    }
    if (enCache?.version == null) {
      // La caché no tenía la versión (o no respondió): se repone si se puede.
      await this.d.almacen.publicarVersion(reclamos.sub, estado.versionSeguridad).catch(() => {
        /* la base sigue siendo la fuente de verdad */
      });
    }
    return {
      usuarioId: reclamos.sub,
      sesionId: reclamos.sid,
      roles: estado.roles,
      versionSeguridad: estado.versionSeguridad,
      debeCambiarClave: estado.debeCambiarClave,
    };
  }
}
