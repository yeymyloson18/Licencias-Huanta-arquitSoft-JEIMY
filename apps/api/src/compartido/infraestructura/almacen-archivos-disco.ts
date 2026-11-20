import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AlmacenArchivos } from '../dominio/almacen-archivos';

// Almacén de documentos en una carpeta (research §R-08 de la 004): un volumen de Docker fuera de la
// carpeta pública del portal y compartido por todas las instancias de la API, que así sigue sin
// estado. En la 010 se reemplaza por un almacén compatible con S3.

/** Token de inyección del almacén compartido (documentos de la 004 y fotos de la 006). */
export const ALMACEN_ARCHIVOS = Symbol('ALMACEN_ARCHIVOS');

const FORMATO_CLAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AlmacenArchivosDisco implements AlmacenArchivos {
  private constructor(private readonly carpeta: string) {}

  /**
   * Crea la carpeta si no existe y comprueba que se puede escribir (nota de T001). El error nombra la
   * variable, nunca la ruta (puede revelar la estructura del servidor).
   */
  static async crear(carpeta: string): Promise<AlmacenArchivosDisco> {
    try {
      await mkdir(carpeta, { recursive: true });
      const prueba = join(carpeta, `.prueba-${randomUUID()}`);
      await writeFile(prueba, '');
      await unlink(prueba);
    } catch {
      throw new Error('No se puede escribir en la carpeta de ALMACEN_ARCHIVOS_RUTA');
    }
    return new AlmacenArchivosDisco(carpeta);
  }

  async guardar(clave: string, contenido: Uint8Array): Promise<void> {
    // `wx`: nunca sobrescribe un archivo existente.
    await writeFile(this.ruta(clave), contenido, { flag: 'wx' });
  }

  async leer(clave: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.ruta(clave)));
  }

  async borrar(clave: string): Promise<void> {
    await rm(this.ruta(clave), { force: true });
  }

  /** Solo claves UUID: imposible salir de la carpeta con `..` u otra ruta. */
  private ruta(clave: string): string {
    if (!FORMATO_CLAVE.test(clave)) {
      throw new Error('Clave de almacén inválida');
    }
    return join(this.carpeta, clave);
  }
}
