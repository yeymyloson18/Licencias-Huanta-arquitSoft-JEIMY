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
import {
  ErrorLimitadorNoDisponible,
  type LimitadorIntentos,
  type ResultadoReserva,
} from '../../../../../src/modulos/seguridad/dominio/puertos/limitador-intentos';
import type { ProtectorDatos } from '../../../../../src/compartido/dominio/protector-datos';
import type {
  EventoSeguridad,
  IdsEvento,
  RegistroEventosSeguridad,
} from '../../../../../src/modulos/seguridad/dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../../../../../src/modulos/seguridad/dominio/puertos/reloj';
import type { RepositorioCodigosOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-codigos-otp';
import type {
  AuditoriaDeRevocacion,
  RepositorioSesiones,
} from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-sesiones';
import type {
  FilaAuditoria,
  FiltroAuditoria,
  PaginaAuditoria,
  RepositorioAuditoria,
} from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-auditoria';
import { ACCIONES_INGRESO_FALLIDO } from '../../../../../src/modulos/seguridad/dominio/accion-auditoria';
import type { EventoAuditoria } from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';
import type {
  BloqueosActuales,
  BloqueosCuentas,
  EstadoBloqueo,
} from '../../../../../src/modulos/seguridad/dominio/puertos/bloqueos-cuentas';
import type {
  AsignacionHistorial,
  CifrasUsuarios,
  ConsultaPanel,
} from '../../../../../src/modulos/seguridad/dominio/puertos/consulta-panel';
import type {
  CambioUsuario,
  CriterioBusquedaUsuarios,
  EstadoSeguridadUsuario,
  PaginaUsuarios,
  RepositorioUsuarios,
} from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-usuarios';
import type { Rol } from '../../../../../src/modulos/seguridad/dominio/rol';
import type { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import { AsignacionRol } from '../../../../../src/modulos/seguridad/dominio/asignacion-rol';
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

/**
 * Auditoría de seguridad en memoria (009). Ignora un `eventoOrigenId` repetido, como el
 * `ON CONFLICT` del adaptador. `falla` simula la base caída.
 */
export class AuditoriaEnMemoria implements RepositorioAuditoria {
  readonly eventos: EventoAuditoria[] = [];
  readonly nombres = new Map<string, string>();
  falla = false;
  registrar(evento: EventoAuditoria): Promise<boolean> {
    if (this.falla) {
      return Promise.reject(new Error('base caída'));
    }
    if (
      evento.eventoOrigenId !== null &&
      this.eventos.some((e) => e.eventoOrigenId === evento.eventoOrigenId)
    ) {
      return Promise.resolve(false);
    }
    this.eventos.push(evento);
    return Promise.resolve(true);
  }
  buscar(
    filtro: FiltroAuditoria,
    desplazamiento: number,
    cantidad: number,
  ): Promise<PaginaAuditoria> {
    const persona = (id: string | null) =>
      id === null ? null : { id, nombre: this.nombres.get(id) ?? 'Usuario no encontrado' };
    const filas = this.eventos
      .map((evento, indice) => ({ evento, indice }))
      .filter(
        ({ evento }) =>
          evento.ocurridoEn >= filtro.desde &&
          evento.ocurridoEn < filtro.hasta &&
          (filtro.accion === undefined || evento.accion === filtro.accion) &&
          (filtro.actorId === undefined || evento.actorUsuarioId === filtro.actorId) &&
          (filtro.afectadoId === undefined || evento.afectadoUsuarioId === filtro.afectadoId),
      )
      .sort(
        (a, b) =>
          b.evento.ocurridoEn.getTime() - a.evento.ocurridoEn.getTime() || b.indice - a.indice,
      )
      .map(({ evento, indice }): FilaAuditoria => ({
        id: String(indice + 1),
        ocurridoEn: evento.ocurridoEn,
        accion: evento.accion,
        actor: persona(evento.actorUsuarioId),
        afectado: persona(evento.afectadoUsuarioId),
        objeto: evento.objeto,
        resultado: evento.resultado,
      }));
    return Promise.resolve({
      filas: filas.slice(desplazamiento, desplazamiento + cantidad),
      total: filas.length,
    });
  }
  ultimoIngreso(usuarioId: string): Promise<Date | null> {
    const ingresos = this.eventos.filter(
      (e) => e.accion === 'INGRESO_CORRECTO' && e.afectadoUsuarioId === usuarioId,
    );
    return Promise.resolve(ingresos.at(-1)?.ocurridoEn ?? null);
  }
  contarIngresosFallidos(desde: Date): Promise<number> {
    return Promise.resolve(
      this.eventos.filter(
        (e) => ACCIONES_INGRESO_FALLIDO.includes(e.accion) && e.ocurridoEn >= desde,
      ).length,
    );
  }
  acciones(): string[] {
    return this.eventos.map((e) => e.accion);
  }
}

export class RepositorioUsuariosEnMemoria implements RepositorioUsuarios {
  readonly usuarios = new Map<string, Usuario>();
  /** Eventos de auditoría guardados con cada cambio (la "misma transacción"). */
  readonly auditoria: EventoAuditoria[] = [];
  guardados = 0;
  crear(usuario: Usuario, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    this.usuarios.set(usuario.id, usuario);
    this.auditoria.push(...auditoria);
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
  guardar(usuario: Usuario, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    this.guardados += 1;
    this.usuarios.set(usuario.id, usuario);
    this.auditoria.push(...auditoria);
    return Promise.resolve();
  }
  buscar(criterio: CriterioBusquedaUsuarios): Promise<PaginaUsuarios> {
    const texto = criterio.texto?.toLowerCase();
    const todos = [...this.usuarios.values()]
      .filter((u) => criterio.activo === undefined || u.activo === criterio.activo)
      .filter(
        (u) =>
          texto === undefined ||
          u.nombreCompleto.valor.toLowerCase().includes(texto) ||
          (criterio.correo !== undefined && u.correo.esIgualA(criterio.correo)),
      )
      .sort((a, b) => a.nombreCompleto.valor.localeCompare(b.nombreCompleto.valor));
    const inicio = (criterio.pagina - 1) * criterio.porPagina;
    return Promise.resolve({
      usuarios: todos.slice(inicio, inicio + criterio.porPagina),
      total: todos.length,
    });
  }
  modificar(usuarioId: string, cambio: CambioUsuario): Promise<Usuario | null> {
    const usuario = this.usuarios.get(usuarioId);
    if (usuario === undefined) {
      return Promise.resolve(null);
    }
    const administradores = [...this.usuarios.values()]
      .filter((u) => u.activo && u.tieneRol('ADMINISTRADOR'))
      .map((u) => u.id);
    // Como la transacción real: se trabaja sobre una copia y solo se guarda si el cambio no falla.
    const copia = copiarUsuario(usuario);
    const auditoria = cambio(copia, administradores) ?? [];
    this.usuarios.set(usuarioId, copia);
    this.auditoria.push(...auditoria);
    this.guardados += 1;
    return Promise.resolve(copia);
  }
  hayAdministradorActivo(): Promise<boolean> {
    return Promise.resolve(false);
  }
  crearSiNoHayAdministradores(usuario: Usuario): Promise<boolean> {
    this.usuarios.set(usuario.id, usuario);
    return Promise.resolve(true);
  }
  obtenerEstadoSeguridad(usuarioId: string): Promise<EstadoSeguridadUsuario | null> {
    const usuario = this.usuarios.get(usuarioId);
    return Promise.resolve(
      usuario === undefined
        ? null
        : {
            activo: usuario.activo,
            versionSeguridad: usuario.versionSeguridad,
            roles: usuario.rolesVigentes,
            debeCambiarClave: usuario.debeCambiarClave,
            sesionRevocada: false,
          },
    );
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
  readonly auditoria: EventoAuditoria[] = [];
  crear(sesion: Sesion, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    this.sesiones.set(sesion.id, sesion);
    this.auditoria.push(...auditoria);
    return Promise.resolve();
  }
  obtenerPorId(id: string): Promise<Sesion | null> {
    return Promise.resolve(this.sesiones.get(id) ?? null);
  }
  guardar(sesion: Sesion, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    this.sesiones.set(sesion.id, sesion);
    this.auditoria.push(...auditoria);
    return Promise.resolve();
  }
  revocarTodasDelUsuario(
    usuarioId: string,
    ahora: Date,
    auditoria?: AuditoriaDeRevocacion,
  ): Promise<string[]> {
    const ids = this.revocar((s) => s.usuarioId === usuarioId, ahora);
    this.auditoria.push(...(auditoria?.(ids) ?? []));
    return Promise.resolve(ids);
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

/**
 * Limitador en memoria con reserva atómica: cada reserva suma y compara en un solo paso (5 intentos
 * por correo o por IP, 3 envíos por usuario); liberar devuelve la reserva.
 */
export class LimitadorFalso implements LimitadorIntentos {
  readonly fallos = new Map<string, number>();
  readonly envios = new Map<string, number>();
  noDisponible = false;

  private clavesIntento(correo: Correo | null, ip: string): string[] {
    return [...(correo === null ? [] : [`correo:${correo.valor}`]), `ip:${ip}`];
  }
  private comprobar(): void {
    if (this.noDisponible) {
      throw new ErrorLimitadorNoDisponible();
    }
  }
  private reservar(
    mapa: Map<string, number>,
    claves: readonly string[],
    maximo: number,
    segundos: number,
  ): Promise<ResultadoReserva> {
    this.comprobar();
    let permitido = true;
    let cuentaExcedida = false;
    for (const clave of claves) {
      const cuenta = (mapa.get(clave) ?? 0) + 1;
      mapa.set(clave, cuenta);
      permitido &&= cuenta <= maximo;
      cuentaExcedida ||= cuenta > maximo && clave.startsWith('correo:');
    }
    if (permitido) {
      return Promise.resolve({ permitido, segundosRestantes: 0 });
    }
    return Promise.resolve({
      permitido,
      segundosRestantes: segundos,
      ...(mapa === this.fallos ? { bloqueo: cuentaExcedida ? 'CUENTA' : 'ORIGEN' } : {}),
    } as ResultadoReserva);
  }
  private liberar(mapa: Map<string, number>, claves: readonly string[]): Promise<void> {
    this.comprobar();
    for (const clave of claves) {
      const cuenta = (mapa.get(clave) ?? 0) - 1;
      if (cuenta <= 0) {
        mapa.delete(clave);
      } else {
        mapa.set(clave, cuenta);
      }
    }
    return Promise.resolve();
  }
  reservarIntento(correo: Correo | null, ip: string): Promise<ResultadoReserva> {
    return this.reservar(this.fallos, this.clavesIntento(correo, ip), 5, 600);
  }
  liberarIntento(correo: Correo | null, ip: string): Promise<void> {
    return this.liberar(this.fallos, this.clavesIntento(correo, ip));
  }
  reservarEnvio(usuarioId: string): Promise<ResultadoReserva> {
    return this.reservar(this.envios, [usuarioId], 3, 300);
  }
  liberarEnvio(usuarioId: string): Promise<void> {
    return this.liberar(this.envios, [usuarioId]);
  }
}

/** Copia profunda de un usuario (con sus asignaciones), para simular una transacción. */
export const copiarUsuario = (usuario: Usuario): Usuario =>
  Usuario.reconstruir({
    id: usuario.id,
    correo: usuario.correo,
    nombreCompleto: usuario.nombreCompleto,
    celular: usuario.celular,
    claveHash: usuario.claveHash,
    debeCambiarClave: usuario.debeCambiarClave,
    activo: usuario.activo,
    versionSeguridad: usuario.versionSeguridad,
    asignaciones: usuario.asignaciones.map((a) =>
      AsignacionRol.reconstruir({
        id: a.id,
        rol: a.rol,
        asignadoPor: a.asignadoPor,
        asignadoEn: a.asignadoEn,
        retiradoPor: a.retiradoPor,
        retiradoEn: a.retiradoEn,
      }),
    ),
  });

/** Cifras fijas del panel (009); `sesionesPorUsuario` alimenta la ficha. */
export class ConsultaPanelFalsa implements ConsultaPanel {
  cifras: CifrasUsuarios = {
    activos: 5,
    inactivos: 2,
    porRol: { CAJA: 2, ADMINISTRADOR: 1 },
    sesionesAbiertas: 3,
  };
  readonly sesionesPorUsuario = new Map<string, number>();
  readonly cuentasExistentes = new Set<string>();
  cifrasUsuarios(): Promise<CifrasUsuarios> {
    return Promise.resolve(this.cifras);
  }
  contarCuentasExistentes(correosHmac: readonly string[]): Promise<number> {
    return Promise.resolve(correosHmac.filter((h) => this.cuentasExistentes.has(h)).length);
  }
  sesionesAbiertasDe(usuarioId: string): Promise<number> {
    return Promise.resolve(this.sesionesPorUsuario.get(usuarioId) ?? 0);
  }
  readonly historiales = new Map<string, AsignacionHistorial[]>();
  historialRoles(usuarioId: string): Promise<readonly AsignacionHistorial[]> {
    return Promise.resolve(this.historiales.get(usuarioId) ?? []);
  }
}

/** Bloqueos en memoria por correo (009). `noDisponible` simula Redis caído. */
export class BloqueosFalsos implements BloqueosCuentas {
  readonly bloqueadas = new Map<string, Date>();
  origenes = 0;
  noDisponible = false;
  readonly desbloqueadas: string[] = [];
  bloqueosActuales(): Promise<BloqueosActuales | null> {
    return Promise.resolve(
      this.noDisponible
        ? null
        : { correosHmac: [...this.bloqueadas.keys()], origenes: this.origenes },
    );
  }
  estadoDeCuenta(correo: Correo): Promise<EstadoBloqueo | null> {
    if (this.noDisponible) {
      return Promise.resolve(null);
    }
    const hasta = this.bloqueadas.get(correo.valor);
    return Promise.resolve(
      hasta === undefined ? { bloqueada: false, hasta: null } : { bloqueada: true, hasta },
    );
  }
  desbloquear(correo: Correo): Promise<void> {
    if (this.noDisponible) {
      return Promise.reject(new ErrorLimitadorNoDisponible());
    }
    this.bloqueadas.delete(correo.valor);
    this.desbloqueadas.push(correo.valor);
    return Promise.resolve();
  }
}
