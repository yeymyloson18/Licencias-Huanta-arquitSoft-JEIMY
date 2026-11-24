import { CodigoOtp } from '../dominio/codigo-otp';
import { Correo } from '../dominio/correo';
import { ErrorDominio } from '../dominio/error-dominio';
import {
  type EntregaCodigo,
  eventoCodigoEnviado,
  eventoIngreso,
  eventoLimiteCodigos,
  type MotivoRechazo,
} from '../dominio/evento-auditoria';
import { ErrorEnvioOtp, type EnviadorOTP } from '../dominio/puertos/enviador-otp';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { HasherClaves } from '../dominio/puertos/hasher-claves';
import type { LimitadorIntentos } from '../dominio/puertos/limitador-intentos';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';
import type { RepositorioCodigosOtp } from '../dominio/puertos/repositorio-codigos-otp';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { huellaOrigen, registrarSinFallar } from './auditoria-comun';
import { ErrorAutenticacion, ErrorDemasiadosIntentos } from './errores';

export interface DependenciasIniciarSesion {
  readonly usuarios: RepositorioUsuarios;
  readonly codigos: RepositorioCodigosOtp;
  readonly hasher: HasherClaves;
  readonly generador: GeneradorSecretos;
  readonly protector: ProtectorDatos;
  readonly enviador: EnviadorOTP;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
  readonly limitador: LimitadorIntentos;
  readonly auditoria: RepositorioAuditoria;
}

export interface DesafioInicioSesion {
  readonly desafioId: string;
  readonly venceEn: Date;
  readonly celularEnmascarado: string;
}

/**
 * Paso 1 del inicio de sesión (FR-001): comprueba correo y clave y envía un código de 6 dígitos al
 * celular del usuario. Correo inexistente o mal formado, usuario inactivo y clave incorrecta lanzan
 * el mismo error, con un costo de tiempo parecido (FR-005).
 */
export class IniciarSesion {
  constructor(private readonly d: DependenciasIniciarSesion) {}

  async ejecutar(entrada: {
    correo: string;
    clave: string;
    ip: string;
  }): Promise<DesafioInicioSesion> {
    const correo = this.leerCorreo(entrada.correo);

    // El intento se reserva de forma atómica ANTES de verificar nada: con muchos intentos a la vez,
    // como máximo 5 llegan a verificar la clave, y el 6.º se rechaza aunque sea correcto.
    const reserva = await this.d.limitador.reservarIntento(correo, entrada.ip);
    if (!reserva.permitido) {
      this.d.eventos.registrar('bloqueo-temporal');
      const bloqueada = correo === null ? null : await this.d.usuarios.obtenerPorCorreo(correo);
      await this.auditar(
        reserva.bloqueo === 'CUENTA' ? 'CUENTA_BLOQUEADA' : 'ORIGEN_BLOQUEADO',
        bloqueada?.id ?? null,
        entrada.ip,
        { segundos: reserva.segundosRestantes },
      );
      throw new ErrorDemasiadosIntentos(reserva.segundosRestantes);
    }

    const usuario = correo === null ? null : await this.d.usuarios.obtenerPorCorreo(correo);

    if (usuario === null) {
      await this.d.hasher.verificarContraFicticia(entrada.clave);
      this.d.eventos.registrar('inicio-sesion-fallido');
      // Sin identificar a nadie: ni el correo, que es un dato personal (FR-014 de la 009).
      await this.auditarClave(null, 'CORREO_NO_REGISTRADO', entrada.ip);
      throw new ErrorAutenticacion();
    }

    const claveCorrecta = await this.d.hasher.verificar(entrada.clave, usuario.claveHash);
    if (!claveCorrecta || !usuario.activo) {
      // El intento reservado queda contado como fallo.
      this.d.eventos.registrar('inicio-sesion-fallido', { usuarioId: usuario.id });
      await this.auditarClave(usuario.id, usuario.activo ? 'CLAVE' : 'CUENTA_INACTIVA', entrada.ip);
      throw new ErrorAutenticacion();
    }
    // Credenciales correctas: se devuelve el intento; solo los fallos quedan contados.
    await this.d.limitador.liberarIntento(correo, entrada.ip);

    const envio = await this.d.limitador.reservarEnvio(usuario.id);
    if (!envio.permitido) {
      this.d.eventos.registrar('bloqueo-temporal', { usuarioId: usuario.id });
      // Pedido insistente de códigos: queda a la vista del administrador (FR-010 de la 010).
      await registrarSinFallar(
        this.d.auditoria,
        this.d.eventos,
        eventoLimiteCodigos({
          proposito: 'INGRESO_PERSONAL',
          usuarioId: usuario.id,
          segundos: envio.segundosRestantes,
          origenHmac: huellaOrigen(this.d.protector, entrada.ip),
          en: this.d.reloj.ahora(),
        }),
      );
      throw new ErrorDemasiadosIntentos(envio.segundosRestantes);
    }

    const ahora = this.d.reloj.ahora();
    await this.d.codigos.vencerVigentesDelUsuario(usuario.id, ahora);

    const desafioId = this.d.generador.generarId();
    const codigoEnClaro = this.d.generador.codigoOtp();
    const codigo = CodigoOtp.crear({
      id: desafioId,
      usuarioId: usuario.id,
      destinoHmac: this.d.protector.hmac(usuario.celular.valor),
      codigoHash: this.d.generador.hmacCodigo(desafioId, codigoEnClaro),
      creadoEn: ahora,
    });
    await this.d.codigos.crear(codigo);
    // El código enviado queda en la auditoría con el destino enmascarado y el id del desafío, para
    // vincularlo con el resultado del paso 2 (010). Nunca el código.
    const auditarEnvio = (entrega: EntregaCodigo) =>
      registrarSinFallar(
        this.d.auditoria,
        this.d.eventos,
        eventoCodigoEnviado({
          proposito: 'INGRESO_PERSONAL',
          canal: this.d.enviador.canal,
          destino: usuario.celular.enmascarado(),
          entrega,
          usuarioId: usuario.id,
          intentoId: desafioId,
          origenHmac: huellaOrigen(this.d.protector, entrada.ip),
          en: ahora,
        }),
      );
    try {
      await this.d.enviador.enviar(usuario.celular, codigoEnClaro, usuario.id);
    } catch {
      // Cualquier fallo del proveedor: el usuario puede pedir otro código (caso límite de la spec),
      // y el envío reservado se devuelve (un fallo del proveedor no castiga al usuario).
      await this.d.limitador.liberarEnvio(usuario.id);
      await auditarEnvio('FALLIDO');
      throw new ErrorEnvioOtp();
    }
    await auditarEnvio('ENTREGADO');

    return {
      desafioId,
      venceEn: codigo.venceEn,
      celularEnmascarado: usuario.celular.enmascarado(),
    };
  }

  private auditarClave(
    afectadoUsuarioId: string | null,
    motivo: MotivoRechazo,
    ip: string,
  ): Promise<void> {
    return this.auditar('CLAVE_INCORRECTA', afectadoUsuarioId, ip, { motivo });
  }

  private auditar(
    accion: 'CLAVE_INCORRECTA' | 'CUENTA_BLOQUEADA' | 'ORIGEN_BLOQUEADO',
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

  private leerCorreo(texto: string): Correo | null {
    try {
      return Correo.crear(texto);
    } catch (error) {
      if (error instanceof ErrorDominio) {
        return null;
      }
      throw error;
    }
  }
}
