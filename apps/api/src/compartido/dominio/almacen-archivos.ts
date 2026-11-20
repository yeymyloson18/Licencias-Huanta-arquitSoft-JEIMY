/**
 * Puerto: almacén de los archivos adjuntos (research §R-08 de la 004). Hoy es una carpeta en un
 * volumen compartido por todas las instancias de la API; en la 010 será un almacén compatible con S3,
 * sin tocar los casos de uso. La clave es un nombre aleatorio, nunca el nombre original.
 */
export interface AlmacenArchivos {
  guardar(clave: string, contenido: Uint8Array): Promise<void>;
  leer(clave: string): Promise<Uint8Array>;
  borrar(clave: string): Promise<void>;
}
