import { randomInt, randomUUID } from 'node:crypto';
import type { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { Celular } from '../../src/modulos/seguridad/dominio/celular';
import { Correo } from '../../src/modulos/seguridad/dominio/correo';
import { NombreCompleto } from '../../src/modulos/seguridad/dominio/nombre-completo';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { Usuario } from '../../src/modulos/seguridad/dominio/usuario';
import { HasherClavesArgon2 } from '../../src/modulos/seguridad/infraestructura/hasher-claves-argon2';
import { ProtectorDatosAesGcm } from '../../src/modulos/seguridad/infraestructura/protector-datos-aes-gcm';
import { RepositorioUsuariosPostgres } from '../../src/modulos/seguridad/infraestructura/repositorio-usuarios-postgres';

export interface OpcionesUsuarioDePrueba {
  readonly roles?: readonly Rol[];
  readonly activo?: boolean;
  readonly debeCambiarClave?: boolean;
  readonly clave?: string;
}

/** Datos en claro del usuario creado, para usarlos en la prueba (todos ficticios). */
export interface UsuarioDePrueba {
  readonly id: string;
  readonly correo: string;
  readonly celular: string;
  readonly nombre: string;
  readonly clave: string;
}

const hasher = new HasherClavesArgon2();

/** Protector con las mismas claves que la aplicación (variables de entorno de las pruebas). */
export const protectorDePrueba = (): ProtectorDatosAesGcm =>
  new ProtectorDatosAesGcm(
    Buffer.from(process.env.CLAVE_CIFRADO_DATOS ?? '', 'base64'),
    Buffer.from(process.env.CLAVE_HMAC_DATOS ?? '', 'base64'),
  );

/**
 * Crea un usuario directamente con el repositorio (sin pasar por la gestión de usuarios de US5),
 * con correo, celular y nombre ficticios y únicos. Por defecto: rol CAJA, activo y clave definitiva.
 */
export const crearUsuarioDePrueba = async (
  prisma: PrismaServicio,
  opciones: OpcionesUsuarioDePrueba = {},
): Promise<UsuarioDePrueba> => {
  const sufijo = randomUUID().slice(0, 8);
  const datos: UsuarioDePrueba = {
    id: randomUUID(),
    correo: `prueba.${sufijo}@ejemplo.pe`,
    celular: `9${String(randomInt(0, 100_000_000)).padStart(8, '0')}`,
    nombre: `Persona Ficticia ${sufijo}`,
    clave: opciones.clave ?? `ClaveDePrueba${sufijo}1`,
  };

  const usuario = Usuario.crear({
    id: datos.id,
    correo: Correo.crear(datos.correo),
    nombreCompleto: NombreCompleto.crear(datos.nombre),
    celular: Celular.crear(datos.celular),
    claveHash: await hasher.huella(datos.clave),
    roles: opciones.roles ?? ['CAJA'],
    asignadoPor: datos.id,
    en: new Date(),
  });
  if (opciones.debeCambiarClave !== true) {
    // Usuario.crear deja la clave como temporal; la mayoría de pruebas necesita una definitiva.
    usuario.cambiarClave(usuario.claveHash);
  }
  if (opciones.activo === false) {
    usuario.desactivar();
  }

  const repositorio = new RepositorioUsuariosPostgres(prisma, protectorDePrueba());
  await repositorio.crear(usuario);
  return datos;
};
