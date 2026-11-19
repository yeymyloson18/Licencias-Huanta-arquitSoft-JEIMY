// Dobles en memoria de los puertos de la identidad del administrado (004).
import type { EmisorTokensIdentidad } from '../../../../../src/modulos/seguridad/dominio/puertos/emisor-tokens';
import {
  ErrorLimitadorNoDisponible,
  type LimitadorIntentosIdentidad,
  type ResultadoReserva,
} from '../../../../../src/modulos/seguridad/dominio/puertos/limitador-intentos';
import type { RepositorioVerificaciones } from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-verificaciones';
import type {
  DatosIdentificacion,
  ResultadoIdentificacion,
  ServicioIdentificacion,
} from '../../../../../src/modulos/seguridad/dominio/puertos/servicio-identificacion';
import {
  type HuellasIdentidad,
  type ResultadoServicioRegistrado,
  VerificacionIdentidad,
} from '../../../../../src/modulos/seguridad/dominio/verificacion-identidad';

export class ServicioIdentificacionFalso implements ServicioIdentificacion {
  resultado: ResultadoIdentificacion = 'COINCIDE';
  readonly consultas: DatosIdentificacion[] = [];
  verificar(datos: DatosIdentificacion): Promise<ResultadoIdentificacion> {
    this.consultas.push(datos);
    return Promise.resolve(this.resultado);
  }
}

/** Copia la verificación (como haría la base) para que el caso de uso no comparta el objeto. */
const copiar = (v: VerificacionIdentidad): VerificacionIdentidad =>
  VerificacionIdentidad.reconstruir({
    id: v.id,
    ...v.huellas,
    codigoHash: v.codigoHash,
    intentos: v.intentos,
    venceEn: v.venceEn,
    confirmadaEn: v.confirmadaEn,
  });

export class RepositorioVerificacionesEnMemoria implements RepositorioVerificaciones {
  readonly verificaciones = new Map<string, VerificacionIdentidad>();
  readonly rechazos: { id: string; huellas: HuellasIdentidad; resultado: string }[] = [];

  crear(verificacion: VerificacionIdentidad): Promise<void> {
    this.verificaciones.set(verificacion.id, copiar(verificacion));
    return Promise.resolve();
  }
  registrarRechazo(
    id: string,
    huellas: HuellasIdentidad,
    resultado: Exclude<ResultadoServicioRegistrado, 'VALIDO'>,
  ): Promise<void> {
    this.rechazos.push({ id, huellas, resultado });
    return Promise.resolve();
  }
  obtenerPorId(id: string): Promise<VerificacionIdentidad | null> {
    const verificacion = this.verificaciones.get(id);
    return Promise.resolve(verificacion ? copiar(verificacion) : null);
  }
  guardar(verificacion: VerificacionIdentidad): Promise<void> {
    this.verificaciones.set(verificacion.id, copiar(verificacion));
    return Promise.resolve();
  }
  vencerPendientesDelDocumento(documentoHmac: Uint8Array, ahora: Date): Promise<void> {
    const clave = new TextDecoder().decode(documentoHmac);
    for (const verificacion of this.verificaciones.values()) {
      if (new TextDecoder().decode(verificacion.huellas.documentoHmac) === clave) {
        verificacion.vencer(ahora);
      }
    }
    return Promise.resolve();
  }
}

export class LimitadorIdentidadFalso implements LimitadorIntentosIdentidad {
  readonly fallos = new Map<string, number>();
  readonly envios = new Map<string, number>();
  noDisponible = false;

  private claves(documento: string | null, ip: string): string[] {
    return [...(documento === null ? [] : [`doc:${documento}`]), `ip:${ip}`];
  }
  private comprobar(): void {
    if (this.noDisponible) {
      throw new ErrorLimitadorNoDisponible();
    }
  }
  private reservar(
    mapa: Map<string, number>,
    claves: string[],
    maximo: number,
  ): Promise<ResultadoReserva> {
    this.comprobar();
    let permitido = true;
    for (const clave of claves) {
      const cuenta = (mapa.get(clave) ?? 0) + 1;
      mapa.set(clave, cuenta);
      permitido &&= cuenta <= maximo;
    }
    return Promise.resolve({ permitido, segundosRestantes: permitido ? 0 : 600 });
  }
  private liberar(mapa: Map<string, number>, claves: string[]): Promise<void> {
    this.comprobar();
    for (const clave of claves) {
      mapa.set(clave, Math.max(0, (mapa.get(clave) ?? 0) - 1));
    }
    return Promise.resolve();
  }
  reservarIntentoIdentidad(documento: string | null, ip: string): Promise<ResultadoReserva> {
    return this.reservar(this.fallos, this.claves(documento, ip), 5);
  }
  liberarIntentoIdentidad(documento: string | null, ip: string): Promise<void> {
    return this.liberar(this.fallos, this.claves(documento, ip));
  }
  reservarEnvioIdentidad(celular: string): Promise<ResultadoReserva> {
    return this.reservar(this.envios, [`cel:${celular}`], 3);
  }
  liberarEnvioIdentidad(celular: string): Promise<void> {
    return this.liberar(this.envios, [`cel:${celular}`]);
  }
}

/** Token `identidad:<verificacionId>`. */
export class EmisorIdentidadFalso implements EmisorTokensIdentidad {
  readonly segundosDeVidaIdentidad = 900;
  firmarIdentidad(verificacionId: string): Promise<string> {
    return Promise.resolve(`identidad:${verificacionId}`);
  }
  verificarIdentidad(token: string): Promise<string | null> {
    return Promise.resolve(token.startsWith('identidad:') ? token.slice(10) : null);
  }
}
