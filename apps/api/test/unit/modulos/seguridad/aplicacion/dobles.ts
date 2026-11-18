// Dobles en memoria de los puertos del módulo Seguridad. Los casos de uso solo reciben puertos, así
// que estas pruebas no tocan base de datos, red ni criptografía real (SC-011).
import { Celular } from '../../../../../src/modulos/seguridad/dominio/celular';
import type { CodigoOtp } from '../../../../../src/modulos/seguridad/dominio/codigo-otp';
import { Correo } from '../../../../../src/modulos/seguridad/dominio/correo';
import { NombreCompleto } from '../../../../../src/modulos/seguridad/dominio/nombre-completo';
import type {
  AlmacenVersionSeguridad,
  EstadoSeguridadEnCache,
} from '../../../../../src/modulos/seguridad/dominio/puertos/almacen-version-seguridad';
import type {
  EmisorTokens,
  ReclamosAcceso,
} from '../../../../../src/modulos/seguridad/dominio/puertos/emisor-tokens';
import type { EnviadorOTP } from '../../../../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import type { GeneradorSecretos } from '../../../../../src/modulos/seguridad/dominio/puertos/generador-secretos';
import type { HasherClaves } from '../../../../../src/modulos/seguridad/dominio/puertos/hasher-claves';
import type { ProtectorDatos } from '../../../../../src/modulos/seguridad/dominio/puertos/protector-datos';
import type {
  EventoSeguridad,
  IdsEvento,
  RegistroEventosSeguridad,
} from '../../../../../src/modulos/seguridad/dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../../../../../src/modulos/seguridad/dominio/puertos/reloj';
import type { RepositorioCodigosOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-codigos-otp';
import type { RepositorioSesiones } from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-usuarios';
import type { Rol } from '../../../../../src/modulos/seguridad/dominio/rol';
import type { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import { Usuario } from '../../../../../src/modulos/seguridad/dominio/usuario';

export const T0 = new Date('2026-11-17T10:00:00.000Z');

export class RelojFalso implements Reloj {
  constructor(private actual: Date = T0) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  avanzar(segundos: number): void {
    this.actual = new Date(this.actual.getTime() + segundos * 1000);
  }
}

/** Huella `h:<clave>`: permite comprobar qué clave se guardó sin argon2. */
export class HasherFalso implements HasherClaves {
  verificacionesFicticias = 0;
  huella(clave: string): Promise<string> {
    return Promise.resolve(`h:${clave}`);
  }
  verificar(clave: string, huella: string): Promise<boolean> {
    return Promise.resolve(huella === `h:${clave}`);
  }
  verificarContraFicticia(): Promise<boolean> {
    this.verificacionesFicticias += 1;
    return Promise.resolve(false);
  }
}

export class GeneradorFalso implements GeneradorSecretos {
  private contadorIds = 0;
  private contadorRefresh = 0;
  codigo = '123456';
  generarId(): string {
    this.contadorIds += 1;
    return `id-${String(this.contadorIds)}`;
  }
  codigoOtp(): string {
    return this.codigo;
  }
  refreshToken(sesionId: string): string {
    this.contadorRefresh += 1;
    return `${sesionId}.r${String(this.contadorRefresh)}`;
  }
  hmacCodigo(desafioId: string, codigo: string): string {
    return `hmac:${desafioId}:${codigo}`;
  }
  sha256(texto: string): string {
    return `sha:${texto}`;
  }
  igualesEnTiempoConstante(a: string, b: string): boolean {
    return a === b;
  }
}

export class ProtectorFalso implements ProtectorDatos {
  cifrar(texto: string): Uint8Array {
    return new TextEncoder().encode(`c:${texto}`);
  }
  descifrar(datos: Uint8Array): string {
    return new TextDecoder().decode(datos).slice(2);
  }
  hmac(texto: string): Uint8Array {
    return new TextEncoder().encode(`m:${texto}`);
  }
}

/** Token `token:<sub>:<sid>:<vs>:<dcc>`; guarda los reclamos firmados para revisarlos. */
export class EmisorFalso implements EmisorTokens {
  readonly segundosDeVida = 900;
  readonly firmados: ReclamosAcceso[] = [];
  firmarAcceso(reclamos: ReclamosAcceso): Promise<string> {
    this.firmados.push(reclamos);
    return Promise.resolve(
      `token:${reclamos.sub}:${reclamos.sid}:${String(reclamos.vs)}:${String(reclamos.dcc)}`,
    );
  }
  verificarAcceso(): Promise<ReclamosAcceso | null> {
    return Promise.resolve(null);
  }
}

export class EnviadorFalso implements EnviadorOTP {
  readonly enviados: { destino: string; codigo: string; usuarioId: string }[] = [];
  falla = false;
  enviar(destino: Celular, codigo: string, usuarioId: string): Promise<void> {
    if (this.falla) {
      return Promise.reject(new Error('sin señal'));
    }
    this.enviados.push({ destino: destino.valor, codigo, usuarioId });
    return Promise.resolve();
  }
}

export class EventosFalsos implements RegistroEventosSeguridad {
  readonly registrados: { evento: EventoSeguridad; ids: IdsEvento }[] = [];
  registrar(evento: EventoSeguridad, ids: IdsEvento = {}): void {
    this.registrados.push({ evento, ids });
  }
  nombres(): EventoSeguridad[] {
    return this.registrados.map((r) => r.evento);
  }
}

export class AlmacenFalso implements AlmacenVersionSeguridad {
  readonly revocadas: string[] = [];
  readonly versiones = new Map<string, number>();
  leerEstado(usuarioId: string, sesionId: string): Promise<EstadoSeguridadEnCache | null> {
    return Promise.resolve({
      version: this.versiones.get(usuarioId) ?? null,
      sesionRevocada: this.revocadas.includes(sesionId),
    });
  }
  publicarVersion(usuarioId: string, version: number): Promise<void> {
    this.versiones.set(usuarioId, version);
    return Promise.resolve();
  }
  marcarSesionesRevocadas(sesionIds: readonly string[]): Promise<void> {
    this.revocadas.push(...sesionIds);
    return Promise.resolve();
  }
}

export class RepositorioUsuariosEnMemoria implements RepositorioUsuarios {
  readonly usuarios = new Map<string, Usuario>();
  guardados = 0;
  crear(usuario: Usuario): Promise<void> {
    this.usuarios.set(usuario.id, usuario);
    return Promise.resolve();
  }
  obtenerPorId(id: string): Promise<Usuario | null> {
    return Promise.resolve(this.usuarios.get(id) ?? null);
  }
  obtenerPorCorreo(correo: Correo): Promise<Usuario | null> {
    return Promise.resolve(
      [...this.usuarios.values()].find((u) => u.correo.esIgualA(correo)) ?? null,
    );
  }
  guardar(usuario: Usuario): Promise<void> {
    this.guardados += 1;
    this.usuarios.set(usuario.id, usuario);
    return Promise.resolve();
  }
}

export class RepositorioCodigosEnMemoria implements RepositorioCodigosOtp {
  readonly codigos = new Map<string, CodigoOtp>();
  crear(codigo: CodigoOtp): Promise<void> {
    this.codigos.set(codigo.id, codigo);
    return Promise.resolve();
  }
  obtenerPorId(id: string): Promise<CodigoOtp | null> {
    return Promise.resolve(this.codigos.get(id) ?? null);
  }
  guardar(codigo: CodigoOtp): Promise<void> {
    this.codigos.set(codigo.id, codigo);
    return Promise.resolve();
  }
  vencerVigentesDelUsuario(usuarioId: string, ahora: Date): Promise<void> {
    for (const codigo of this.codigos.values()) {
      if (
        codigo.usuarioId === usuarioId &&
        codigo.usadoEn === undefined &&
        codigo.venceEn > ahora
      ) {
        codigo.vencer(ahora);
      }
    }
    return Promise.resolve();
  }
}

export class RepositorioSesionesEnMemoria implements RepositorioSesiones {
  readonly sesiones = new Map<string, Sesion>();
  crear(sesion: Sesion): Promise<void> {
    this.sesiones.set(sesion.id, sesion);
    return Promise.resolve();
  }
  obtenerPorId(id: string): Promise<Sesion | null> {
    return Promise.resolve(this.sesiones.get(id) ?? null);
  }
  guardar(sesion: Sesion): Promise<void> {
    this.sesiones.set(sesion.id, sesion);
    return Promise.resolve();
  }
  revocarTodasDelUsuario(usuarioId: string, ahora: Date): Promise<string[]> {
    return Promise.resolve(this.revocar((s) => s.usuarioId === usuarioId, ahora));
  }
  revocarTodasMenos(usuarioId: string, sesionId: string, ahora: Date): Promise<string[]> {
    return Promise.resolve(
      this.revocar((s) => s.usuarioId === usuarioId && s.id !== sesionId, ahora),
    );
  }
  private revocar(filtro: (sesion: Sesion) => boolean, ahora: Date): string[] {
    const ids: string[] = [];
    for (const sesion of this.sesiones.values()) {
      if (filtro(sesion) && !sesion.revocada) {
        sesion.revocar(ahora);
        ids.push(sesion.id);
      }
    }
    return ids;
  }
}

export interface OpcionesUsuario {
  readonly id?: string;
  readonly correo?: string;
  readonly clave?: string;
  readonly roles?: readonly Rol[];
  readonly activo?: boolean;
  readonly debeCambiarClave?: boolean;
}

/** Usuario ficticio con huella `h:<clave>` (ver HasherFalso). */
export const usuarioFicticio = (opciones: OpcionesUsuario = {}): Usuario => {
  const usuario = Usuario.crear({
    id: opciones.id ?? 'usuario-1',
    correo: Correo.crear(opciones.correo ?? 'persona@ejemplo.pe'),
    nombreCompleto: NombreCompleto.crear('Persona Ficticia'),
    celular: Celular.crear('987654321'),
    claveHash: `h:${opciones.clave ?? 'ClaveActual2026'}`,
    roles: opciones.roles ?? ['CAJA'],
    asignadoPor: 'admin',
    en: T0,
  });
  if (opciones.debeCambiarClave !== true) {
    usuario.cambiarClave(usuario.claveHash);
  }
  if (opciones.activo === false) {
    usuario.desactivar();
  }
  return usuario;
};
