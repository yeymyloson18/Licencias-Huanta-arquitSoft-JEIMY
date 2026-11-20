import type { TipoArchivo } from '../../../compartido/dominio/tipo-archivo';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita enviar a PostgreSQL un id mal formado (fallaría la conversión a `uuid`). */
export const esUuid = (texto: string): boolean => FORMATO_UUID.test(texto);

/** Copia a un `Uint8Array` con `ArrayBuffer` propio, el tipo que espera Prisma para `bytea`. */
export const aBytes = (datos: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(datos);

const TIPOS: readonly TipoArchivo[] = ['application/pdf', 'image/jpeg', 'image/png'];

/** Los `CHECK` de la base garantizan el tipo; se valida igual al cruzar la frontera. */
export const detectarTipoMimeGuardado = (valor: string): TipoArchivo => {
  const tipo = TIPOS.find((permitido) => permitido === valor);
  if (tipo === undefined) {
    throw new Error('Tipo de archivo desconocido en la base');
  }
  return tipo;
};
