// Tokens de inyección del módulo Seguridad. Viven en un archivo propio para que
// `seguridad.module.ts` y las clases de `presentacion/` los compartan sin importarse entre sí
// (regla `sin-ciclos`).

export const REPOSITORIO_USUARIOS = Symbol('REPOSITORIO_USUARIOS');
export const HASHER_CLAVES = Symbol('HASHER_CLAVES');
export const GENERADOR_SECRETOS = Symbol('GENERADOR_SECRETOS');
export const EMISOR_TOKENS = Symbol('EMISOR_TOKENS');
export const RELOJ = Symbol('RELOJ');
export const REGISTRO_EVENTOS_SEGURIDAD = Symbol('REGISTRO_EVENTOS_SEGURIDAD');
export const REPOSITORIO_CODIGOS_OTP = Symbol('REPOSITORIO_CODIGOS_OTP');
export const REPOSITORIO_SESIONES = Symbol('REPOSITORIO_SESIONES');
export const ENVIADOR_OTP = Symbol('ENVIADOR_OTP');
export const ALMACEN_VERSION_SEGURIDAD = Symbol('ALMACEN_VERSION_SEGURIDAD');
export const LIMITADOR_INTENTOS = Symbol('LIMITADOR_INTENTOS');
export const SERVICIO_IDENTIFICACION = Symbol('SERVICIO_IDENTIFICACION');
export const REPOSITORIO_VERIFICACIONES = Symbol('REPOSITORIO_VERIFICACIONES');
export const REPOSITORIO_AUDITORIA = Symbol('REPOSITORIO_AUDITORIA');
export const BLOQUEOS_CUENTAS = Symbol('BLOQUEOS_CUENTAS');
export const CONSULTA_PANEL = Symbol('CONSULTA_PANEL');
