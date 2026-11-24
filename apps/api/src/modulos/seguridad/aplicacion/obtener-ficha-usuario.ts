import type { AsignacionHistorial, ConsultaPanel } from '../dominio/puertos/consulta-panel';
import type { BloqueosCuentas, EstadoBloqueo } from '../dominio/puertos/bloqueos-cuentas';
import type { Reloj } from '../dominio/puertos/reloj';
import type { FilaAuditoria, RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import type { Usuario } from '../dominio/usuario';
import { ErrorUsuarioNoEncontrado } from './errores';

export interface DependenciasObtenerFichaUsuario {
  readonly usuarios: RepositorioUsuarios;
  readonly consulta: ConsultaPanel;
  readonly bloqueos: BloqueosCuentas;
  readonly auditoria: RepositorioAuditoria;
  readonly reloj: Reloj;
}

export interface FichaUsuario {
  readonly usuario: Usuario;
  readonly ultimoIngreso: Date | null;
  readonly sesionesAbiertas: number;
  /** `null` si el servicio de bloqueos no responde. */
  readonly bloqueo: EstadoBloqueo | null;
  readonly historialRoles: readonly AsignacionHistorial[];
  readonly ultimosEventos: readonly FilaAuditoria[];
}

const ULTIMOS_EVENTOS = 10;

/** Ficha del usuario para el administrador (HU3 y FR-015 de la 009). */
export class ObtenerFichaUsuario {
  constructor(private readonly d: DependenciasObtenerFichaUsuario) {}

  async ejecutar(usuarioId: string): Promise<FichaUsuario> {
    const usuario = await this.d.usuarios.obtenerPorId(usuarioId);
    if (usuario === null) {
      throw new ErrorUsuarioNoEncontrado();
    }
    const ahora = this.d.reloj.ahora();
    const [ultimoIngreso, sesionesAbiertas, bloqueo, historialRoles, eventos] = await Promise.all([
      this.d.auditoria.ultimoIngreso(usuario.id),
      this.d.consulta.sesionesAbiertasDe(usuario.id, ahora),
      this.d.bloqueos.estadoDeCuenta(usuario.correo, ahora),
      this.d.consulta.historialRoles(usuario.id),
      this.d.auditoria.buscar(
        { desde: new Date(0), hasta: new Date(ahora.getTime() + 60_000), afectadoId: usuario.id },
        0,
        ULTIMOS_EVENTOS,
      ),
    ]);
    return {
      usuario,
      ultimoIngreso,
      sesionesAbiertas,
      bloqueo,
      historialRoles,
      ultimosEventos: eventos.filas,
    };
  }
}
