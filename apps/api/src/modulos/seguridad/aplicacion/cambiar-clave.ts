import { PoliticaClave } from '../dominio/politica-clave';
import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { EmisorTokens } from '../dominio/puertos/emisor-tokens';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { HasherClaves } from '../dominio/puertos/hasher-claves';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { emitirSesion, type SesionEmitida } from './emitir-sesion';
import { ErrorAutenticacion, ErrorClaveInvalida } from './errores';

export interface DependenciasCambiarClave {
  readonly usuarios: RepositorioUsuarios;
  readonly sesiones: RepositorioSesiones;
  readonly hasher: HasherClaves;
  readonly generador: GeneradorSecretos;
  readonly emisor: EmisorTokens;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
  readonly almacen: AlmacenVersionSeguridad;
}

export interface EntradaCambiarClave {
  readonly usuarioId: string;
  readonly sesionId: string;
  readonly claveActual: string;
  readonly claveNueva: string;
}

/**
 * Cambia la clave del usuario autenticado; es obligatorio cuando la clave es temporal (FR-022). La
 * clave nueva cumple la política y no repite la actual (FR-022a). Al terminar se cierran las demás
 * sesiones del usuario y se entrega un token nuevo sin la marca de clave temporal.
 */
export class CambiarClave {
  constructor(private readonly d: DependenciasCambiarClave) {}

  async ejecutar(entrada: EntradaCambiarClave): Promise<SesionEmitida> {
    const usuario = await this.d.usuarios.obtenerPorId(entrada.usuarioId);
    const sesion = await this.d.sesiones.obtenerPorId(entrada.sesionId);
    if (usuario?.activo !== true || sesion === null || sesion.revocada) {
      throw new ErrorAutenticacion();
    }
    if (sesion.usuarioId !== usuario.id) {
      throw new ErrorAutenticacion();
    }
    if (!(await this.d.hasher.verificar(entrada.claveActual, usuario.claveHash))) {
      throw new ErrorAutenticacion();
    }

    const reglas = PoliticaClave.validar(entrada.claveNueva);
    if (
      reglas.length === 0 &&
      (await this.d.hasher.verificar(entrada.claveNueva, usuario.claveHash))
    ) {
      reglas.push('IGUAL_A_LA_ACTUAL');
    }
    if (reglas.length > 0) {
      throw new ErrorClaveInvalida(reglas);
    }

    const ahora = this.d.reloj.ahora();
    usuario.cambiarClave(await this.d.hasher.huella(entrada.claveNueva));
    await this.d.usuarios.guardar(usuario);
    // Después de guardar: los tokens con la versión anterior se vuelven a evaluar (§R-07).
    await this.d.almacen.publicarVersion(usuario.id, usuario.versionSeguridad);

    const revocadas = await this.d.sesiones.revocarTodasMenos(usuario.id, sesion.id, ahora);
    await this.d.almacen.marcarSesionesRevocadas(revocadas);

    const nuevoRefresh = this.d.generador.refreshToken(sesion.id);
    sesion.rotar(this.d.generador.sha256(nuevoRefresh), ahora);
    await this.d.sesiones.guardar(sesion);

    this.d.eventos.registrar('clave-cambiada', { usuarioId: usuario.id, sesionId: sesion.id });
    return emitirSesion(this.d.emisor, usuario, sesion, nuevoRefresh);
  }
}
