import { esAccionAuditoria, type AccionAuditoria } from './accion-auditoria';
import { ErrorDominio } from './error-dominio';
import { esRol, type Rol } from './rol';

export type ResultadoAuditoria = 'EXITO' | 'RECHAZADO';

/** Por qué se rechazó un intento de ingreso, sin decir nada de la persona (research §R-04). */
export type MotivoRechazo =
  'CLAVE' | 'CUENTA_INACTIVA' | 'CORREO_NO_REGISTRADO' | 'DESAFIO_NO_VALIDO';

const MOTIVOS: readonly MotivoRechazo[] = [
  'CLAVE',
  'CUENTA_INACTIVA',
  'CORREO_NO_REGISTRADO',
  'DESAFIO_NO_VALIDO',
];

export type CampoEditable = 'nombreCompleto' | 'celular';
const CAMPOS: readonly CampoEditable[] = ['nombreCompleto', 'celular'];

/**
 * Detalle permitido (data-model.md §3). Solo valores de listas cerradas o números: ningún texto libre
 * que pudiera llevar un correo, un nombre o una clave.
 */
export interface DetalleAuditoria {
  readonly motivo?: MotivoRechazo;
  readonly rol?: Rol;
  readonly roles?: readonly Rol[];
  readonly campos?: readonly CampoEditable[];
  readonly sesiones?: number;
  readonly segundos?: number;
}

type ClaveDetalle = keyof DetalleAuditoria;

/** Qué claves del detalle admite cada acción; las demás no llevan detalle. */
const DETALLE_POR_ACCION: Partial<Record<AccionAuditoria, readonly ClaveDetalle[]>> = {
  CLAVE_INCORRECTA: ['motivo'],
  CODIGO_INCORRECTO: ['motivo'],
  CUENTA_BLOQUEADA: ['segundos'],
  ORIGEN_BLOQUEADO: ['segundos'],
  USUARIO_CREADO: ['roles'],
  USUARIO_EDITADO: ['campos'],
  ROL_ASIGNADO: ['rol'],
  ROL_QUITADO: ['rol'],
  SESIONES_CERRADAS: ['sesiones'],
};

export interface DatosEventoAuditoria {
  readonly accion: AccionAuditoria;
  readonly ocurridoEn: Date;
  readonly resultado: ResultadoAuditoria;
  readonly actorUsuarioId?: string | null;
  readonly afectadoUsuarioId?: string | null;
  readonly objeto?: string | null;
  readonly origenHmac?: string | null;
  readonly detalle?: DetalleAuditoria;
  readonly eventoOrigenId?: bigint | null;
}

/** Código de receta (`LIC-01`) o fecha `AAAA-MM-DD`: identificadores de negocio, nunca personales. */
const OBJETO = /^(?:[A-Z0-9][A-Z0-9_-]{0,39}|\d{4}-\d{2}-\d{2})$/;
const HMAC_HEX = /^[0-9a-f]{64}$/;
/** Identificador interno (uuid en la base): sin `@`, espacios ni puntos que delaten un correo. */
const ID_INTERNO = /^[A-Za-z0-9-]{1,64}$/;

const esEnteroNoNegativo = (valor: unknown): boolean =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;

const validarDetalle = (accion: AccionAuditoria, detalle: DetalleAuditoria): void => {
  const permitidas = DETALLE_POR_ACCION[accion] ?? [];
  for (const [clave, valor] of Object.entries(detalle)) {
    if (valor === undefined) {
      continue;
    }
    if (!permitidas.includes(clave as ClaveDetalle)) {
      throw new ErrorDominio(`La acción ${accion} no admite el detalle ${clave}`);
    }
    const valido =
      (clave === 'motivo' && MOTIVOS.includes(valor as MotivoRechazo)) ||
      (clave === 'rol' && esRol(valor)) ||
      (clave === 'roles' && Array.isArray(valor) && valor.length > 0 && valor.every(esRol)) ||
      (clave === 'campos' &&
        Array.isArray(valor) &&
        valor.length > 0 &&
        valor.every((campo) => CAMPOS.includes(campo as CampoEditable))) ||
      ((clave === 'sesiones' || clave === 'segundos') && esEnteroNoNegativo(valor));
    if (!valido) {
      throw new ErrorDominio(`El detalle ${clave} no es válido`);
    }
  }
};

const validarId = (id: string | null, campo: string): void => {
  if (id !== null && !ID_INTERNO.test(id)) {
    throw new ErrorDominio(`El ${campo} debe ser un identificador interno`);
  }
};

/**
 * Un hecho de la auditoría de seguridad (data-model.md §3). Se valida al crearlo para que nunca
 * llegue a la base un dato personal: los mensajes de error no repiten el valor recibido.
 */
export class EventoAuditoria {
  readonly accion: AccionAuditoria;
  readonly ocurridoEn: Date;
  readonly resultado: ResultadoAuditoria;
  readonly actorUsuarioId: string | null;
  readonly afectadoUsuarioId: string | null;
  readonly objeto: string | null;
  readonly origenHmac: string | null;
  readonly detalle: DetalleAuditoria;
  readonly eventoOrigenId: bigint | null;

  private constructor(datos: DatosEventoAuditoria) {
    this.accion = datos.accion;
    this.ocurridoEn = datos.ocurridoEn;
    this.resultado = datos.resultado;
    this.actorUsuarioId = datos.actorUsuarioId ?? null;
    this.afectadoUsuarioId = datos.afectadoUsuarioId ?? null;
    this.objeto = datos.objeto ?? null;
    this.origenHmac = datos.origenHmac ?? null;
    this.detalle = datos.detalle ?? {};
    this.eventoOrigenId = datos.eventoOrigenId ?? null;
  }

  static crear(datos: DatosEventoAuditoria): EventoAuditoria {
    if (!esAccionAuditoria(datos.accion)) {
      throw new ErrorDominio('La acción de auditoría no existe');
    }
    const resultado: string = datos.resultado;
    if (resultado !== 'EXITO' && resultado !== 'RECHAZADO') {
      throw new ErrorDominio('El resultado debe ser EXITO o RECHAZADO');
    }
    if (Number.isNaN(datos.ocurridoEn.getTime())) {
      throw new ErrorDominio('La fecha del evento no es válida');
    }
    const evento = new EventoAuditoria(datos);
    validarId(evento.actorUsuarioId, 'actor');
    validarId(evento.afectadoUsuarioId, 'afectado');
    if (evento.objeto !== null && !OBJETO.test(evento.objeto)) {
      throw new ErrorDominio('El objeto debe ser un código de receta o una fecha');
    }
    if (evento.origenHmac !== null && !HMAC_HEX.test(evento.origenHmac)) {
      throw new ErrorDominio('El origen debe ser una huella HMAC');
    }
    if (evento.eventoOrigenId !== null && evento.eventoOrigenId <= 0n) {
      throw new ErrorDominio('El evento de origen debe ser positivo');
    }
    validarDetalle(evento.accion, evento.detalle);
    return evento;
  }
}

// --- Fábricas por tipo de acción (research §R-04): dejan claro quién es actor y quién afectado.

/** Intento de ingreso: nadie actuó todavía; el afectado es la cuenta si existe (aclaración 1). */
export const eventoIngreso = (datos: {
  readonly accion: Extract<
    AccionAuditoria,
    'CLAVE_INCORRECTA' | 'CODIGO_INCORRECTO' | 'CUENTA_BLOQUEADA' | 'ORIGEN_BLOQUEADO'
  >;
  readonly afectadoUsuarioId: string | null;
  readonly origenHmac: string | null;
  readonly en: Date;
  readonly detalle?: DetalleAuditoria;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: datos.accion,
    ocurridoEn: datos.en,
    resultado: 'RECHAZADO',
    actorUsuarioId: null,
    afectadoUsuarioId: datos.afectadoUsuarioId,
    origenHmac: datos.origenHmac,
    ...(datos.detalle === undefined ? {} : { detalle: datos.detalle }),
  });

/** Algo que la persona hizo sobre su propia cuenta: actor y afectado son ella. */
export const eventoPropio = (datos: {
  readonly accion: Extract<
    AccionAuditoria,
    'INGRESO_CORRECTO' | 'CIERRE_SESION' | 'CLAVE_CAMBIADA'
  >;
  readonly usuarioId: string;
  readonly origenHmac: string | null;
  readonly en: Date;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: datos.accion,
    ocurridoEn: datos.en,
    resultado: 'EXITO',
    actorUsuarioId: datos.usuarioId,
    afectadoUsuarioId: datos.usuarioId,
    origenHmac: datos.origenHmac,
  });

/** El administrador actúa sobre un usuario. */
export const eventoGestion = (datos: {
  readonly accion: Extract<
    AccionAuditoria,
    | 'USUARIO_CREADO'
    | 'USUARIO_EDITADO'
    | 'USUARIO_DESACTIVADO'
    | 'USUARIO_REACTIVADO'
    | 'ROL_ASIGNADO'
    | 'ROL_QUITADO'
    | 'CLAVE_TEMPORAL_ASIGNADA'
    | 'SESIONES_CERRADAS'
    | 'CUENTA_DESBLOQUEADA'
  >;
  readonly administradorId: string;
  readonly usuarioId: string;
  readonly en: Date;
  readonly detalle?: DetalleAuditoria;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: datos.accion,
    ocurridoEn: datos.en,
    resultado: 'EXITO',
    actorUsuarioId: datos.administradorId,
    afectadoUsuarioId: datos.usuarioId,
    ...(datos.detalle === undefined ? {} : { detalle: datos.detalle }),
  });

/** Cambio de configuración que llegó por la cola de eventos (research §R-02). */
export const eventoConfiguracion = (datos: {
  readonly accion: Extract<
    AccionAuditoria,
    | 'RECETA_ACTUALIZADA'
    | 'RECETA_DESACTIVADA'
    | 'RECETA_REACTIVADA'
    | 'FERIADO_REGISTRADO'
    | 'FERIADO_ELIMINADO'
  >;
  readonly usuarioId: string;
  readonly objeto: string;
  readonly en: Date;
  readonly eventoOrigenId: bigint;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: datos.accion,
    ocurridoEn: datos.en,
    resultado: 'EXITO',
    actorUsuarioId: datos.usuarioId,
    objeto: datos.objeto,
    eventoOrigenId: datos.eventoOrigenId,
  });
