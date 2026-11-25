import type { ConsultaPanel } from '../dominio/puertos/consulta-panel';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import type { Usuario } from '../dominio/usuario';
import { ErrorAutenticacion } from './errores';

export interface DependenciasObtenerMiPerfil {
  readonly usuarios: RepositorioUsuarios;
  readonly consulta: ConsultaPanel;
  readonly auditoria: RepositorioAuditoria;
  readonly reloj: Reloj;
}

export interface MiPerfil {
  readonly usuario: Usuario;
  readonly ultimoIngreso: Date | null;
  readonly sesionesAbiertas: number;
}

/**
 * Perfil propio de quien tiene la sesión (011, FR-002 a FR-005). Recibe el id solo de la sesión
 * validada; usa los mismos puertos que la ficha del administrador (009) para que "último ingreso" y
 * "sesiones abiertas" signifiquen lo mismo. Un usuario inexistente o inactivo es "sin sesión".
 */
export class ObtenerMiPerfil {
  constructor(private readonly d: DependenciasObtenerMiPerfil) {}

  async ejecutar(usuarioId: string): Promise<MiPerfil> {
    const usuario = await this.d.usuarios.obtenerPorId(usuarioId);
    if (usuario?.activo !== true) {
      throw new ErrorAutenticacion();
    }
    const [ultimoIngreso, sesionesAbiertas] = await Promise.all([
      this.d.auditoria.ultimoIngreso(usuario.id),
      this.d.consulta.sesionesAbiertasDe(usuario.id, this.d.reloj.ahora()),
    ]);
    return { usuario, ultimoIngreso, sesionesAbiertas };
  }
}
