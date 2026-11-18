import type { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { AsignacionRol } from '../dominio/asignacion-rol';
import { Celular } from '../dominio/celular';
import { Correo } from '../dominio/correo';
import { NombreCompleto } from '../dominio/nombre-completo';
import type { ProtectorDatos } from '../dominio/puertos/protector-datos';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { esRol } from '../dominio/rol';
import { Usuario } from '../dominio/usuario';
import { aBytes } from './uuid';

const conRolesVigentes = {
  usuario_rol: { where: { retirado_en: null } },
} satisfies Prisma.usuarioInclude;

type FilaUsuario = Prisma.usuarioGetPayload<{ include: typeof conRolesVigentes }>;

/**
 * Adaptador de `seguridad.usuario` y `seguridad.usuario_rol` (solo el esquema propio, principio III).
 * El correo y el celular se cifran con AES-256-GCM y el correo se busca por su HMAC (MD3). Los
 * errores nunca incluyen esos valores.
 */
export class RepositorioUsuariosPostgres implements RepositorioUsuarios {
  constructor(
    private readonly prisma: PrismaServicio,
    private readonly protector: ProtectorDatos,
  ) {}

  async crear(usuario: Usuario): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.usuario.create({
        data: {
          id: usuario.id,
          ...this.datosPersonales(usuario),
          correo_cifrado: aBytes(this.protector.cifrar(usuario.correo.valor)),
          correo_hmac: this.hmacCorreo(usuario.correo),
        },
      }),
      this.prisma.usuario_rol.createMany({
        data: usuario.asignaciones.map((asignacion) => ({
          usuario_id: usuario.id,
          rol_codigo: asignacion.rol,
          asignado_por: asignacion.asignadoPor,
          asignado_en: asignacion.asignadoEn,
        })),
      }),
    ]);
  }

  async obtenerPorId(id: string): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({ where: { id }, include: conRolesVigentes });
    return fila === null ? null : this.aUsuario(fila);
  }

  async obtenerPorCorreo(correo: Correo): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({
      where: { correo_hmac: this.hmacCorreo(correo) },
      include: conRolesVigentes,
    });
    return fila === null ? null : this.aUsuario(fila);
  }

  async guardar(usuario: Usuario): Promise<void> {
    const retiradas = usuario.asignaciones.filter(
      (asignacion) => asignacion.id !== undefined && !asignacion.esVigente,
    );
    const nuevas = usuario.asignaciones.filter((asignacion) => asignacion.id === undefined);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { ...this.datosPersonales(usuario), actualizado_en: new Date() },
      }),
      ...retiradas.map((asignacion) =>
        this.prisma.usuario_rol.updateMany({
          where: { id: asignacion.id ?? '', retirado_en: null },
          data: {
            retirado_por: asignacion.retiradoPor ?? null,
            retirado_en: asignacion.retiradoEn ?? null,
          },
        }),
      ),
      this.prisma.usuario_rol.createMany({
        data: nuevas
          .filter((asignacion) => asignacion.esVigente)
          .map((asignacion) => ({
            usuario_id: usuario.id,
            rol_codigo: asignacion.rol,
            asignado_por: asignacion.asignadoPor,
            asignado_en: asignacion.asignadoEn,
          })),
      }),
    ]);
  }

  private datosPersonales(usuario: Usuario) {
    return {
      nombre_completo: usuario.nombreCompleto.valor,
      clave_hash: usuario.claveHash,
      celular_cifrado: aBytes(this.protector.cifrar(usuario.celular.valor)),
      activo: usuario.activo,
      debe_cambiar_clave: usuario.debeCambiarClave,
      version_seguridad: usuario.versionSeguridad,
    };
  }

  private hmacCorreo(correo: Correo): Uint8Array<ArrayBuffer> {
    return aBytes(this.protector.hmac(correo.valor));
  }

  private aUsuario(fila: FilaUsuario): Usuario {
    return Usuario.reconstruir({
      id: fila.id,
      correo: Correo.crear(this.protector.descifrar(fila.correo_cifrado)),
      nombreCompleto: NombreCompleto.crear(fila.nombre_completo),
      celular: Celular.crear(this.protector.descifrar(fila.celular_cifrado)),
      claveHash: fila.clave_hash,
      debeCambiarClave: fila.debe_cambiar_clave,
      activo: fila.activo,
      versionSeguridad: fila.version_seguridad,
      asignaciones: fila.usuario_rol.map((asignacion) => {
        if (!esRol(asignacion.rol_codigo)) {
          // El CHECK de seguridad.rol lo impide; se valida igual al cruzar la frontera.
          throw new Error(`Rol desconocido en la asignación ${asignacion.id}`);
        }
        return AsignacionRol.reconstruir({
          id: asignacion.id,
          rol: asignacion.rol_codigo,
          asignadoPor: asignacion.asignado_por,
          asignadoEn: asignacion.asignado_en,
        });
      }),
    });
  }
}
