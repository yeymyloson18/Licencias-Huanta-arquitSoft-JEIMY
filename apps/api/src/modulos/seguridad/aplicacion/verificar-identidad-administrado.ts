import {
  type EntregaCodigo,
  eventoCodigoEnviado,
  eventoLimiteCodigos,
} from '../dominio/evento-auditoria';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';
import { huellaOrigen, registrarSinFallar } from './auditoria-comun';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { DatosIdentidadAdministrado } from '../dominio/identidad-administrado';
import { ErrorEnvioOtp, type EnviadorOTP } from '../dominio/puertos/enviador-otp';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { LimitadorIntentosIdentidad } from '../dominio/puertos/limitador-intentos';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioVerificaciones } from '../dominio/puertos/repositorio-verificaciones';
import type { ServicioIdentificacion } from '../dominio/puertos/servicio-identificacion';
import { VerificacionIdentidad } from '../dominio/verificacion-identidad';
import {
  ErrorDemasiadosIntentos,
  ErrorIdentidadNoCoincide,
  ErrorIdentificacionNoDisponible,
} from './errores';
import { aHex, calcularHuellas, datosParaServicio, leerIdentidad } from './identidad-comun';

export interface DependenciasVerificarIdentidad {
  readonly servicio: ServicioIdentificacion;
  readonly verificaciones: RepositorioVerificaciones;
  readonly limitador: LimitadorIntentosIdentidad;
  readonly generador: GeneradorSecretos;
  readonly protector: ProtectorDatos;
  readonly enviador: EnviadorOTP;
  readonly reloj: Reloj;
  /** Auditoría de los códigos enviados (010): sin documento, RUC ni celular completo. */
  readonly auditoria: RepositorioAuditoria;
  readonly eventos: RegistroEventosSeguridad;
}

export interface DesafioIdentidad {
  readonly desafioId: string;
  readonly venceEn: Date;
  readonly celularEnmascarado: string;
}

/**
 * Paso 1 de la identidad en línea (CU03, FR-001 a FR-007 de la 004): comprueba al titular y, si
 * actúa, al representante con el servicio de identificación, y envía un código de 6 dígitos al
 * celular. Repetirlo con los mismos datos es "otro código": el anterior deja de valer.
 */
export class VerificarIdentidadAdministrado {
  constructor(private readonly d: DependenciasVerificarIdentidad) {}

  async ejecutar(
    entrada: DatosIdentidadAdministrado & { readonly ip: string },
  ): Promise<DesafioIdentidad> {
    const identidad = leerIdentidad(entrada);
    const huellas = calcularHuellas(identidad, this.d.protector);
    const documento = aHex(huellas.documentoHmac);

    // Reserva atómica antes de consultar el servicio (mismo esquema que el inicio de sesión, 002).
    const reserva = await this.d.limitador.reservarIntentoIdentidad(documento, entrada.ip);
    if (!reserva.permitido) {
      throw new ErrorDemasiadosIntentos(reserva.segundosRestantes);
    }

    const ahora = this.d.reloj.ahora();
    const resultado = await this.d.servicio.verificar(datosParaServicio(identidad));
    if (resultado === 'NO_DISPONIBLE') {
      // Una falla del proveedor no castiga a la persona: el intento se devuelve.
      await this.d.limitador.liberarIntentoIdentidad(documento, entrada.ip);
      await this.d.verificaciones.registrarRechazo(
        this.d.generador.generarId(),
        huellas,
        'NO_DISPONIBLE',
        ahora,
      );
      throw new ErrorIdentificacionNoDisponible();
    }
    if (resultado === 'NO_COINCIDE') {
      // El intento queda contado como fallo.
      await this.d.verificaciones.registrarRechazo(
        this.d.generador.generarId(),
        huellas,
        'NO_VALIDO',
        ahora,
      );
      throw new ErrorIdentidadNoCoincide();
    }
    await this.d.limitador.liberarIntentoIdentidad(documento, entrada.ip);

    const celular = aHex(huellas.celularHmac);
    const envio = await this.d.limitador.reservarEnvioIdentidad(celular);
    if (!envio.permitido) {
      await registrarSinFallar(
        this.d.auditoria,
        this.d.eventos,
        eventoLimiteCodigos({
          proposito: 'IDENTIDAD_ADMINISTRADO',
          usuarioId: null,
          segundos: envio.segundosRestantes,
          origenHmac: huellaOrigen(this.d.protector, entrada.ip),
          en: ahora,
        }),
      );
      throw new ErrorDemasiadosIntentos(envio.segundosRestantes);
    }

    await this.d.verificaciones.vencerPendientesDelDocumento(huellas.documentoHmac, ahora);
    const desafioId = this.d.generador.generarId();
    const codigoEnClaro = this.d.generador.codigoOtp();
    const verificacion = VerificacionIdentidad.crear({
      id: desafioId,
      huellas,
      codigoHash: this.d.generador.hmacCodigo(desafioId, codigoEnClaro),
      creadaEn: ahora,
    });
    await this.d.verificaciones.crear(verificacion);
    const auditarEnvio = (entrega: EntregaCodigo) =>
      registrarSinFallar(
        this.d.auditoria,
        this.d.eventos,
        eventoCodigoEnviado({
          proposito: 'IDENTIDAD_ADMINISTRADO',
          canal: this.d.enviador.canal,
          destino: identidad.celular.enmascarado(),
          entrega,
          usuarioId: null,
          intentoId: null,
          origenHmac: huellaOrigen(this.d.protector, entrada.ip),
          en: ahora,
        }),
      );
    try {
      await this.d.enviador.enviar(identidad.celular, codigoEnClaro, desafioId);
    } catch {
      await this.d.limitador.liberarEnvioIdentidad(celular);
      await auditarEnvio('FALLIDO');
      throw new ErrorEnvioOtp();
    }
    await auditarEnvio('ENTREGADO');

    return {
      desafioId,
      venceEn: verificacion.venceEn,
      celularEnmascarado: identidad.celular.enmascarado(),
    };
  }
}
