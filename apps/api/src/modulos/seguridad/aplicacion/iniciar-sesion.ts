import { CodigoOtp } from '../dominio/codigo-otp';
import { Correo } from '../dominio/correo';
import { ErrorDominio } from '../dominio/error-dominio';
import { ErrorEnvioOtp, type EnviadorOTP } from '../dominio/puertos/enviador-otp';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { HasherClaves } from '../dominio/puertos/hasher-claves';
import type { LimitadorIntentos } from '../dominio/puertos/limitador-intentos';
import type { ProtectorDatos } from '../dominio/puertos/protector-datos';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioCodigosOtp } from '../dominio/puertos/repositorio-codigos-otp';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
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

    // Los límites van ANTES que las credenciales: el 6.º intento se rechaza aunque sea correcto.
    const fallos = await this.d.limitador.consultarFallos(correo, entrada.ip);
    if (fallos.bloqueado) {
      this.d.eventos.registrar('bloqueo-temporal');
      throw new ErrorDemasiadosIntentos(fallos.segundosRestantes);
    }

    const usuario = correo === null ? null : await this.d.usuarios.obtenerPorCorreo(correo);

    if (usuario === null) {
      await this.d.hasher.verificarContraFicticia(entrada.clave);
      await this.d.limitador.registrarFallo(correo, entrada.ip);
      this.d.eventos.registrar('inicio-sesion-fallido');
      throw new ErrorAutenticacion();
    }

    const claveCorrecta = await this.d.hasher.verificar(entrada.clave, usuario.claveHash);
    if (!claveCorrecta || !usuario.activo) {
      await this.d.limitador.registrarFallo(correo, entrada.ip);
      this.d.eventos.registrar('inicio-sesion-fallido', { usuarioId: usuario.id });
      throw new ErrorAutenticacion();
    }

    const envios = await this.d.limitador.consultarEnvios(usuario.id);
    if (envios.bloqueado) {
      this.d.eventos.registrar('bloqueo-temporal', { usuarioId: usuario.id });
      throw new ErrorDemasiadosIntentos(envios.segundosRestantes);
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
    try {
      await this.d.enviador.enviar(usuario.celular, codigoEnClaro, usuario.id);
    } catch {
      // Cualquier fallo del proveedor: el usuario puede pedir otro código (caso límite de la spec).
      throw new ErrorEnvioOtp();
    }
    // Solo cuenta el envío si salió (un fallo del proveedor no castiga al usuario).
    await this.d.limitador.registrarEnvio(usuario.id);

    return {
      desafioId,
      venceEn: codigo.venceEn,
      celularEnmascarado: usuario.celular.enmascarado(),
    };
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
