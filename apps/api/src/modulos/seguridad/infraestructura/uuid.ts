const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita enviar a PostgreSQL un id mal formado (fallaría la conversión a `uuid`). */
export const esUuid = (texto: string): boolean => FORMATO_UUID.test(texto);

/** Copia a un `Uint8Array` con `ArrayBuffer` propio, el tipo que espera Prisma para `bytea`. */
export const aBytes = (datos: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(datos);
