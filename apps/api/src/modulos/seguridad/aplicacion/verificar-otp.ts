import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import { eventoIngreso, eventoPropio, type MotivoRechazo } from '../dominio/evento-auditoria';
import type { EmisorTokens } from '../dominio/puertos/emisor-tokens';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { LimitadorIntentos } from '../dominio/puertos/limitador-intentos';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';
import type { RepositorioCodigosOtp } from '../dominio/puertos/repositorio-codigos-otp';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { Sesion } from '../dominio/sesion';
import { huellaOrigen, registrarSinFallar } from './auditoria-comun';
import { emitirSesion, type SesionEmitida } from './emitir-sesion';
import { ErrorAutenticacion, ErrorDemasiadosIntentos } from './errores';

export interface DependenciasVerificarOtp {
  readonly codigos: RepositorioCodigosOtp;
  readonly usuarios: RepositorioUsuarios;
  readonly sesiones: RepositorioSesiones;
  readonly generador: GeneradorSecretos;
  readonly emisor: EmisorTokens;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
  readonly limitador: LimitadorIntentos;
  readonly auditoria: RepositorioAuditoria;
  readonly protector: ProtectorDatos;
}

/**
 * Paso 2 del inicio de sesión: verifica el código y abre una sesión de hasta 8 horas (FR-002,
 * FR-003). Código inexistente, incorrecto, vencido, agotado o usado, y usuario desactivado entre los
 * dos pasos, lanzan el mismo error.
 */
export class VerificarOtp {
  constructor(private readonly d: DependenciasVerificarOtp) {}

  async ejecutar(entrada: {
    desafioId: string;
    codigo: string;
    ip: string;
  }): Promise<SesionEmitida> {
    const codigo = await this.d.codigos.obtenerPorId(entrada.desafioId);
    const usuario = codigo === null ? null : await this.d.usuarios.obtenerPorId(codigo.usuarioId);
    // Los fallos del código suman al mismo contador que los de la clave (por correo y por IP).
    const correo = usuario?.correo ?? null;

    // Reserva atómica antes de verificar (ver IniciarSesion). Un desafío inexistente solo cuenta
    // para el origen.
    const reserva = await this.d.limitador.reservarIntento(correo, entrada.ip);
    if (!reserva.permitido) {
      this.d.eventos.registrar('bloqueo-temporal', usuario ? { usuarioId: usuario.id } : {});
      await this.auditar(
        reserva.bloqueo === 'CUENTA' ? 'CUENTA_BLOQUEADA' : 'ORIGEN_BLOQUEADO',
        usuario?.id ?? null,
        entrada.ip,
        { segundos: reserva.segundosRestantes },
      );
      throw new ErrorDemasiadosIntentos(reserva.segundosRestantes);
    }

    if (codigo === null) {
      this.d.eventos.registrar('inicio-sesion-fallido');
      await this.auditar('CODIGO_INCORRECTO', null, entrada.ip, { motivo: 'DESAFIO_NO_VALIDO' });
      throw new ErrorAutenticacion();
    }

    const ahora = this.d.reloj.ahora();
    const esCorrecto = this.d.generador.igualesEnTiempoConstante(
      this.d.generador.hmacCodigo(codigo.id, entrada.codigo),
      codigo.codigoHash,
    );
    const resultado = codigo.verificar(esCorrecto, ahora);
    await this.d.codigos.guardar(codigo);

    if (resultado !== 'CORRECTO') {
      this.d.eventos.registrar('inicio-sesion-fallido', { usuarioId: codigo.usuarioId });
      await this.auditar('CODIGO_INCORRECTO', codigo.usuarioId, entrada.ip, {});
      throw new ErrorAutenticacion();
    }
    await this.d.limitador.liberarIntento(correo, entrada.ip);

    if (usuario?.activo !== true) {
      this.d.eventos.registrar('inicio-sesion-fallido', { usuarioId: codigo.usuarioId });
      await this.auditar('CODIGO_INCORRECTO', codigo.usuarioId, entrada.ip, {
        motivo: 'CUENTA_INACTIVA',
      });
      throw new ErrorAutenticacion();
    }

    const sesionId = this.d.generador.generarId();
    const refreshToken = this.d.generador.refreshToken(sesionId);
    const sesion = Sesion.crear({
      id: sesionId,
      usuarioId: usuario.id,
      refreshHash: this.d.generador.sha256(refreshToken),
      creadaEn: ahora,
    });
    // La sesión y su `INGRESO_CORRECTO` se guardan en la misma transacción (research §R-03, 009).
    await this.d.sesiones.crear(sesion, [
      eventoPropio({
        accion: 'INGRESO_CORRECTO',
        usuarioId: usuario.id,
        origenHmac: huellaOrigen(this.d.protector, entrada.ip),
        en: ahora,
      }),
    ]);

    this.d.eventos.registrar('inicio-sesion-exitoso', { usuarioId: usuario.id, sesionId });
    return emitirSesion(this.d.emisor, usuario, sesion, refreshToken);
  }

  private auditar(
    accion: 'CODIGO_INCORRECTO' | 'CUENTA_BLOQUEADA' | 'ORIGEN_BLOQUEADO',
    afectadoUsuarioId: string | null,
    ip: string,
    detalle: { readonly motivo?: MotivoRechazo; readonly segundos?: number },
  ): Promise<void> {
    return registrarSinFallar(
      this.d.auditoria,
      this.d.eventos,
      eventoIngreso({
        accion,
        afectadoUsuarioId,
        origenHmac: huellaOrigen(this.d.protector, ip),
        en: this.d.reloj.ahora(),
        detalle,
      }),
    );
  }
}
