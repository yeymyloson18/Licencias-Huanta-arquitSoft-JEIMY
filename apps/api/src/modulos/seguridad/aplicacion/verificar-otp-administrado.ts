import type { EmisorTokensIdentidad } from '../dominio/puertos/emisor-tokens';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { LimitadorIntentosIdentidad } from '../dominio/puertos/limitador-intentos';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioVerificaciones } from '../dominio/puertos/repositorio-verificaciones';
import { ErrorAutenticacion, ErrorDemasiadosIntentos } from './errores';
import { aHex } from './identidad-comun';

export interface DependenciasVerificarOtpAdministrado {
  readonly verificaciones: RepositorioVerificaciones;
  readonly limitador: LimitadorIntentosIdentidad;
  readonly generador: GeneradorSecretos;
  readonly emisor: EmisorTokensIdentidad;
  readonly reloj: Reloj;
}

export interface TokenIdentidadEmitido {
  readonly token: string;
  readonly expiraEn: number;
}

/**
 * Paso 2 de la identidad en línea: con el código correcto entrega el `tokenIdentidad` de 30 minutos,
 * que sirve para presentar una sola solicitud (aclaración 2 de la 004). Desafío inexistente, código
 * incorrecto, vencido, agotado o reemplazado lanzan el mismo error.
 */
export class VerificarOtpAdministrado {
  constructor(private readonly d: DependenciasVerificarOtpAdministrado) {}

  async ejecutar(entrada: {
    desafioId: string;
    codigo: string;
    ip: string;
  }): Promise<TokenIdentidadEmitido> {
    const verificacion = await this.d.verificaciones.obtenerPorId(entrada.desafioId);
    const documento = verificacion === null ? null : aHex(verificacion.huellas.documentoHmac);

    const reserva = await this.d.limitador.reservarIntentoIdentidad(documento, entrada.ip);
    if (!reserva.permitido) {
      throw new ErrorDemasiadosIntentos(reserva.segundosRestantes);
    }
    if (verificacion === null) {
      throw new ErrorAutenticacion();
    }

    const esCorrecto = this.d.generador.igualesEnTiempoConstante(
      this.d.generador.hmacCodigo(verificacion.id, entrada.codigo),
      verificacion.codigoHash,
    );
    const resultado = verificacion.verificar(esCorrecto, this.d.reloj.ahora());
    await this.d.verificaciones.guardar(verificacion);
    if (resultado !== 'CORRECTO') {
      throw new ErrorAutenticacion();
    }
    await this.d.limitador.liberarIntentoIdentidad(documento, entrada.ip);

    return {
      token: await this.d.emisor.firmarIdentidad(verificacion.id),
      expiraEn: this.d.emisor.segundosDeVidaIdentidad,
    };
  }
}
