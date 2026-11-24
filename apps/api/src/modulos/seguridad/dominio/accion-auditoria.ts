/**
 * Acciones de la auditoría de seguridad (FR-006 de la 009, data-model.md §2). Es una lista cerrada:
 * la migración 0012 la repite en el `CHECK` de `seguridad.auditoria` y el contrato en
 * `AccionAuditoriaSeguridad`.
 */
export const ACCIONES_AUDITORIA = [
  // Ingresos
  'INGRESO_CORRECTO',
  'CLAVE_INCORRECTA',
  'CODIGO_INCORRECTO',
  'CUENTA_BLOQUEADA',
  'ORIGEN_BLOQUEADO',
  'CIERRE_SESION',
  'CLAVE_CAMBIADA',
  // Gestión de usuarios
  'USUARIO_CREADO',
  'USUARIO_EDITADO',
  'USUARIO_DESACTIVADO',
  'USUARIO_REACTIVADO',
  'ROL_ASIGNADO',
  'ROL_QUITADO',
  'CLAVE_TEMPORAL_ASIGNADA',
  'SESIONES_CERRADAS',
  'CUENTA_DESBLOQUEADA',
  // Configuración
  'RECETA_ACTUALIZADA',
  'RECETA_DESACTIVADA',
  'RECETA_REACTIVADA',
  'FERIADO_REGISTRADO',
  'FERIADO_ELIMINADO',
] as const;

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

export type GrupoAuditoria = 'INGRESOS' | 'GESTION_USUARIOS' | 'CONFIGURACION';

interface DescripcionAccion {
  readonly grupo: GrupoAuditoria;
  readonly texto: string;
}

const DESCRIPCIONES: Readonly<Record<AccionAuditoria, DescripcionAccion>> = {
  INGRESO_CORRECTO: { grupo: 'INGRESOS', texto: 'Ingreso correcto' },
  CLAVE_INCORRECTA: { grupo: 'INGRESOS', texto: 'Clave incorrecta' },
  CODIGO_INCORRECTO: { grupo: 'INGRESOS', texto: 'Código incorrecto' },
  CUENTA_BLOQUEADA: { grupo: 'INGRESOS', texto: 'Cuenta bloqueada por intentos' },
  ORIGEN_BLOQUEADO: { grupo: 'INGRESOS', texto: 'Origen bloqueado por intentos' },
  CIERRE_SESION: { grupo: 'INGRESOS', texto: 'Cierre de sesión' },
  CLAVE_CAMBIADA: { grupo: 'INGRESOS', texto: 'Clave cambiada' },
  USUARIO_CREADO: { grupo: 'GESTION_USUARIOS', texto: 'Usuario creado' },
  USUARIO_EDITADO: { grupo: 'GESTION_USUARIOS', texto: 'Usuario editado' },
  USUARIO_DESACTIVADO: { grupo: 'GESTION_USUARIOS', texto: 'Usuario desactivado' },
  USUARIO_REACTIVADO: { grupo: 'GESTION_USUARIOS', texto: 'Usuario reactivado' },
  ROL_ASIGNADO: { grupo: 'GESTION_USUARIOS', texto: 'Rol asignado' },
  ROL_QUITADO: { grupo: 'GESTION_USUARIOS', texto: 'Rol quitado' },
  CLAVE_TEMPORAL_ASIGNADA: { grupo: 'GESTION_USUARIOS', texto: 'Clave temporal asignada' },
  SESIONES_CERRADAS: { grupo: 'GESTION_USUARIOS', texto: 'Sesiones cerradas por el administrador' },
  CUENTA_DESBLOQUEADA: { grupo: 'GESTION_USUARIOS', texto: 'Cuenta desbloqueada' },
  RECETA_ACTUALIZADA: { grupo: 'CONFIGURACION', texto: 'Receta actualizada' },
  RECETA_DESACTIVADA: { grupo: 'CONFIGURACION', texto: 'Receta desactivada' },
  RECETA_REACTIVADA: { grupo: 'CONFIGURACION', texto: 'Receta reactivada' },
  FERIADO_REGISTRADO: { grupo: 'CONFIGURACION', texto: 'Feriado registrado' },
  FERIADO_ELIMINADO: { grupo: 'CONFIGURACION', texto: 'Feriado eliminado' },
};

/** Intentos de ingreso que cuentan como fallidos en el panel (research §R-06). */
export const ACCIONES_INGRESO_FALLIDO: readonly AccionAuditoria[] = [
  'CLAVE_INCORRECTA',
  'CODIGO_INCORRECTO',
  'CUENTA_BLOQUEADA',
  'ORIGEN_BLOQUEADO',
];

export const esAccionAuditoria = (valor: unknown): valor is AccionAuditoria =>
  typeof valor === 'string' && (ACCIONES_AUDITORIA as readonly string[]).includes(valor);

/** Texto en español sencillo para la pantalla y el CSV. */
export const textoAccion = (accion: AccionAuditoria): string => DESCRIPCIONES[accion].texto;

export const grupoAccion = (accion: AccionAuditoria): GrupoAuditoria => DESCRIPCIONES[accion].grupo;

/**
 * Cómo se muestra un evento sin actor: los intentos de ingreso son de alguien que todavía no se
 * identificó ("Sin sesión"); en el resto, actuó el propio sistema.
 */
export const textoSinActor = (accion: AccionAuditoria): string =>
  grupoAccion(accion) === 'INGRESOS' ? 'Sin sesión' : 'Sistema';
