// Tokens de inyección del módulo Orientación (012). Viven aparte de orientacion.module.ts para que
// presentacion/ y las pruebas los usen sin importar la raíz de composición.

export const FUENTE_CATALOGO_ORIENTACION = Symbol('FUENTE_CATALOGO_ORIENTACION');
export const FUENTE_GUIA_ORIENTACION = Symbol('FUENTE_GUIA_ORIENTACION');
/** Las pruebas de integración lo reemplazan por el proveedor simulado (nunca el real). */
export const PROVEEDOR_ORIENTACION = Symbol('PROVEEDOR_ORIENTACION');
export const LIMITADOR_PREGUNTAS = Symbol('LIMITADOR_PREGUNTAS');
export const RELOJ_ORIENTACION = Symbol('RELOJ_ORIENTACION');
