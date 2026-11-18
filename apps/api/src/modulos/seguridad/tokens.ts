// Tokens de inyección del módulo Seguridad. Viven en un archivo propio para que
// `seguridad.module.ts` y las clases de `presentacion/` los compartan sin importarse entre sí
// (regla `sin-ciclos`).

export const REPOSITORIO_USUARIOS = Symbol('REPOSITORIO_USUARIOS');
export const PROTECTOR_DATOS = Symbol('PROTECTOR_DATOS');
export const HASHER_CLAVES = Symbol('HASHER_CLAVES');
export const GENERADOR_SECRETOS = Symbol('GENERADOR_SECRETOS');
export const EMISOR_TOKENS = Symbol('EMISOR_TOKENS');
export const RELOJ = Symbol('RELOJ');
export const REGISTRO_EVENTOS_SEGURIDAD = Symbol('REGISTRO_EVENTOS_SEGURIDAD');
