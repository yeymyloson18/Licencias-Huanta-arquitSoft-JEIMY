import type { EmisorTokens } from '../dominio/puertos/emisor-tokens';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioCodigosOtp } from '../dominio/puertos/repositorio-codigos-otp';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { Sesion } from '../dominio/sesion';
import { emitirSesion, type SesionEmitida } from './emitir-sesion';
import { ErrorAutenticacion } from './errores';

export interface DependenciasVerificarOtp {
  readonly codigos: RepositorioCodigosOtp;
  readonly usuarios: RepositorioUsuarios;
  readonly sesiones: RepositorioSesiones;
  readonly generador: GeneradorSecretos;
  readonly emisor: EmisorTokens;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
}

/**
 * Paso 2 del inicio de sesión: verifica el código y abre una sesión de hasta 8 horas (FR-002,
 * FR-003). Código inexistente, incorrecto, vencido, agotado o usado, y usuario desactivado entre los
 * dos pasos, lanzan el mismo error.
 */
export class VerificarOtp {
  constructor(private readonly d: DependenciasVerificarOtp) {}

  async ejecutar(entrada: { desafioId: string; codigo: string }): Promise<SesionEmitida> {
    const codigo = await this.d.codigos.obtenerPorId(entrada.desafioId);
    if (codigo === null) {
      this.d.eventos.registrar('inicio-sesion-fallido');
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
      throw new ErrorAutenticacion();
    }

    const usuario = await this.d.usuarios.obtenerPorId(codigo.usuarioId);
    if (usuario?.activo !== true) {
      this.d.eventos.registrar('inicio-sesion-fallido', { usuarioId: codigo.usuarioId });
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
    await this.d.sesiones.crear(sesion);

    this.d.eventos.registrar('inicio-sesion-exitoso', { usuarioId: usuario.id, sesionId });
    return emitirSesion(this.d.emisor, usuario, sesion, refreshToken);
  }
}
