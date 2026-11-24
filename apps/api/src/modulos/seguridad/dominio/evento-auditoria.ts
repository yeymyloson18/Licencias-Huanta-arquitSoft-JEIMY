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

/** Para qué se envió un código de 6 dígitos (010). */
export type PropositoCodigo = 'INGRESO_PERSONAL' | 'IDENTIDAD_ADMINISTRADO';
const PROPOSITOS: readonly PropositoCodigo[] = ['INGRESO_PERSONAL', 'IDENTIDAD_ADMINISTRADO'];
/** Medio del envío; lo informa el adaptador del puerto `EnviadorOTP` (research §R-04 de la 010). */
export type CanalCodigo = 'SIMULADO' | 'BUZON' | 'SMS' | 'CORREO';
const CANALES: readonly CanalCodigo[] = ['SIMULADO', 'BUZON', 'SMS', 'CORREO'];
export type EntregaCodigo = 'ENTREGADO' | 'FALLIDO';
const ENTREGAS: readonly EntregaCodigo[] = ['ENTREGADO', 'FALLIDO'];
/** Objeto de los eventos de la identidad del administrado: no hay cuenta (010). */
export const OBJETO_IDENTIDAD_ADMINISTRADO = 'IDENTIDAD_ADMINISTRADO';
/** Celular `9*****321` o correo `ju***@dominio`: nunca el destino completo (aclaración 4, 010). */
const DESTINO_ENMASCARADO = /^(?:[0-9]\*{5}[0-9]{3}|[^@\s*]{1,2}\*{3}@[^\s@]+)$/;
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
  readonly proposito?: PropositoCodigo;
  readonly canal?: CanalCodigo;
  readonly destino?: string;
  readonly entrega?: EntregaCodigo;
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
  CODIGO_ENVIADO: ['proposito', 'canal', 'destino', 'entrega'],
  CODIGO_LIMITE_ALCANZADO: ['proposito', 'segundos'],
};

/** Acciones que pueden llevar el identificador del intento de ingreso (research §R-02 de la 010). */
const ACCIONES_CON_INTENTO: readonly AccionAuditoria[] = [
  'CODIGO_ENVIADO',
  'INGRESO_CORRECTO',
  'CODIGO_INCORRECTO',
  'CUENTA_BLOQUEADA',
  'ORIGEN_BLOQUEADO',
];

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
  /** Id del desafío del ingreso del personal (010); vincula el código con su resultado. */
  readonly intentoId?: string | null;
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
      ((clave === 'sesiones' || clave === 'segundos') && esEnteroNoNegativo(valor)) ||
      (clave === 'proposito' && PROPOSITOS.includes(valor as PropositoCodigo)) ||
      (clave === 'canal' && CANALES.includes(valor as CanalCodigo)) ||
      (clave === 'entrega' && ENTREGAS.includes(valor as EntregaCodigo)) ||
      (clave === 'destino' && typeof valor === 'string' && DESTINO_ENMASCARADO.test(valor));
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
  readonly intentoId: string | null;

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
    this.intentoId = datos.intentoId ?? null;
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
    validarId(evento.intentoId, 'intento');
    if (evento.intentoId !== null && !ACCIONES_CON_INTENTO.includes(evento.accion)) {
      throw new ErrorDominio(`La acción ${evento.accion} no lleva intento`);
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
  readonly intentoId?: string | null;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: datos.accion,
    ocurridoEn: datos.en,
    resultado: 'RECHAZADO',
    actorUsuarioId: null,
    afectadoUsuarioId: datos.afectadoUsuarioId,
    origenHmac: datos.origenHmac,
    intentoId: datos.intentoId ?? null,
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
  readonly intentoId?: string | null;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: datos.accion,
    ocurridoEn: datos.en,
    resultado: 'EXITO',
    actorUsuarioId: datos.usuarioId,
    afectadoUsuarioId: datos.usuarioId,
    origenHmac: datos.origenHmac,
    intentoId: datos.intentoId ?? null,
  });

/**
 * Un código de 6 dígitos enviado (010): en el ingreso del personal, sobre la cuenta y con el intento;
 * en la identidad del administrado, sin cuenta (objeto `IDENTIDAD_ADMINISTRADO`). Nunca el código.
 */
export const eventoCodigoEnviado = (datos: {
  readonly proposito: PropositoCodigo;
  readonly canal: CanalCodigo;
  readonly destino: string;
  readonly entrega: EntregaCodigo;
  readonly usuarioId: string | null;
  readonly intentoId: string | null;
  readonly origenHmac: string | null;
  readonly en: Date;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: 'CODIGO_ENVIADO',
    ocurridoEn: datos.en,
    resultado: datos.entrega === 'ENTREGADO' ? 'EXITO' : 'RECHAZADO',
    actorUsuarioId: null,
    afectadoUsuarioId: datos.usuarioId,
    objeto: datos.proposito === 'IDENTIDAD_ADMINISTRADO' ? OBJETO_IDENTIDAD_ADMINISTRADO : null,
    origenHmac: datos.origenHmac,
    intentoId: datos.intentoId,
    detalle: {
      proposito: datos.proposito,
      canal: datos.canal,
      destino: datos.destino,
      entrega: datos.entrega,
    },
  });

/** Se alcanzó el cupo de 3 códigos en 15 minutos (010): la regla no cambia, solo queda a la vista. */
export const eventoLimiteCodigos = (datos: {
  readonly proposito: PropositoCodigo;
  readonly usuarioId: string | null;
  readonly segundos: number;
  readonly origenHmac: string | null;
  readonly en: Date;
}): EventoAuditoria =>
  EventoAuditoria.crear({
    accion: 'CODIGO_LIMITE_ALCANZADO',
    ocurridoEn: datos.en,
    resultado: 'RECHAZADO',
    actorUsuarioId: null,
    afectadoUsuarioId: datos.usuarioId,
    objeto: datos.proposito === 'IDENTIDAD_ADMINISTRADO' ? OBJETO_IDENTIDAD_ADMINISTRADO : null,
    origenHmac: datos.origenHmac,
    detalle: { proposito: datos.proposito, segundos: datos.segundos },
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
