import { eventoGestion } from '../dominio/evento-auditoria';
import type { BloqueosCuentas } from '../dominio/puertos/bloqueos-cuentas';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { ReglasAccionesAdministrador } from '../dominio/reglas-acciones-administrador';
import { ErrorUsuarioNoEncontrado } from './errores';

export interface DependenciasDesbloquearCuenta {
  readonly usuarios: RepositorioUsuarios;
  readonly bloqueos: BloqueosCuentas;
  readonly auditoria: RepositorioAuditoria;
  readonly reloj: Reloj;
}

/**
 * "Desbloquear cuenta" (FR-017 de la 009): borra el contador de intentos fallidos de la cuenta antes
 * de los 15 minutos; el del origen no se toca. Se registra aunque no estuviera bloqueada (la acción
 * fue pedida). Si el servicio de bloqueos no responde, lanza `ErrorLimitadorNoDisponible` y no se
 * registra nada.
 */
export class DesbloquearCuenta {
  constructor(private readonly d: DependenciasDesbloquearCuenta) {}

  async ejecutar(usuarioId: string, administradorId: string): Promise<void> {
    ReglasAccionesAdministrador.verificar('DESBLOQUEAR', administradorId, usuarioId);
    const usuario = await this.d.usuarios.obtenerPorId(usuarioId);
    if (usuario === null) {
      throw new ErrorUsuarioNoEncontrado();
    }
    await this.d.bloqueos.desbloquear(usuario.correo);
    await this.d.auditoria.registrar(
      eventoGestion({
        accion: 'CUENTA_DESBLOQUEADA',
        administradorId,
        usuarioId: usuario.id,
        en: this.d.reloj.ahora(),
      }),
    );
  }
}
