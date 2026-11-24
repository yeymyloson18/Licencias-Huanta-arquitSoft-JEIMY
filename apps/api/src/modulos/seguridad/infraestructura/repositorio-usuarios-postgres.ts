import type { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { AsignacionRol } from '../dominio/asignacion-rol';
import { Celular } from '../dominio/celular';
import { Correo } from '../dominio/correo';
import type { EventoAuditoria } from '../dominio/evento-auditoria';
import { NombreCompleto } from '../dominio/nombre-completo';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type {
  CambioUsuario,
  CriterioBusquedaUsuarios,
  EstadoSeguridadUsuario,
  PaginaUsuarios,
  RepositorioUsuarios,
} from '../dominio/puertos/repositorio-usuarios';
import { esRol } from '../dominio/rol';
import { Usuario } from '../dominio/usuario';
import { insertarEventosAuditoria } from './repositorio-auditoria-postgres';
import { aBytes, esUuid } from './uuid';

const conRolesVigentes = {
  usuario_rol: { where: { retirado_en: null } },
} satisfies Prisma.usuarioInclude;

type FilaUsuario = Prisma.usuarioGetPayload<{ include: typeof conRolesVigentes }>;

/**
 * Clave del bloqueo de aplicación que serializa todo cambio que puede afectar a los administradores
 * activos (FR-020, FR-024). Con un bloqueo de filas (`FOR UPDATE`) no alcanza: con cero
 * administradores no hay filas que bloquear, y la transacción que espera no vuelve a leer las
 * asignaciones de rol que la otra retiró (research.md §R-09).
 */
const BLOQUEO_ADMINISTRADORES = 'seguridad.administradores';

const ADMINISTRADORES_ACTIVOS = {
  activo: true,
  usuario_rol: { some: { rol_codigo: 'ADMINISTRADOR', retirado_en: null } },
} satisfies Prisma.usuarioWhereInput;

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

  async crear(usuario: Usuario, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.insertar(tx, usuario);
      await insertarEventosAuditoria(tx, auditoria);
    });
  }

  async hayAdministradorActivo(): Promise<boolean> {
    return (await this.prisma.usuario.count({ where: ADMINISTRADORES_ACTIVOS })) > 0;
  }

  async crearSiNoHayAdministradores(usuario: Usuario): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Con cero administradores no hay filas que bloquear con FOR UPDATE: un bloqueo de aplicación
      // (liberado al terminar la transacción) serializa las ejecuciones simultáneas del comando.
      await bloquearAdministradores(tx);
      if ((await tx.usuario.count({ where: ADMINISTRADORES_ACTIVOS })) > 0) {
        return false;
      }
      await this.insertar(tx, usuario);
      return true;
    });
  }

  private async insertar(tx: Prisma.TransactionClient, usuario: Usuario): Promise<void> {
    await tx.usuario.create({
      data: {
        id: usuario.id,
        ...this.datosPersonales(usuario),
        correo_cifrado: aBytes(this.protector.cifrar(usuario.correo.valor)),
        correo_hmac: this.hmacCorreo(usuario.correo),
      },
    });
    await tx.usuario_rol.createMany({
      data: usuario.asignaciones.map((asignacion) => ({
        usuario_id: usuario.id,
        rol_codigo: asignacion.rol,
        asignado_por: asignacion.asignadoPor,
        asignado_en: asignacion.asignadoEn,
      })),
    });
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

  async guardar(usuario: Usuario, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.guardarEn(tx, usuario);
      await insertarEventosAuditoria(tx, auditoria);
    });
  }

  async buscar(criterio: CriterioBusquedaUsuarios): Promise<PaginaUsuarios> {
    const coincidencias: Prisma.usuarioWhereInput[] = [];
    if (criterio.texto !== undefined) {
      coincidencias.push({ nombre_completo: { contains: criterio.texto, mode: 'insensitive' } });
    }
    if (criterio.correo !== undefined) {
      coincidencias.push({ correo_hmac: this.hmacCorreo(criterio.correo) });
    }
    const filtro: Prisma.usuarioWhereInput = {
      ...(criterio.activo === undefined ? {} : { activo: criterio.activo }),
      ...(coincidencias.length === 0 ? {} : { OR: coincidencias }),
    };

    const [filas, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where: filtro,
        include: conRolesVigentes,
        orderBy: [{ nombre_completo: 'asc' }, { id: 'asc' }],
        skip: (criterio.pagina - 1) * criterio.porPagina,
        take: criterio.porPagina,
      }),
      this.prisma.usuario.count({ where: filtro }),
    ]);
    return { usuarios: filas.map((fila) => this.aUsuario(fila)), total };
  }

  async modificar(usuarioId: string, cambio: CambioUsuario): Promise<Usuario | null> {
    if (!esUuid(usuarioId)) {
      return null;
    }
    return this.prisma.$transaction(async (tx) => {
      await bloquearAdministradores(tx);
      // Lecturas DESPUÉS de tomar el bloqueo: ven lo que confirmó quien lo tenía antes.
      const administradores = await tx.usuario.findMany({
        where: ADMINISTRADORES_ACTIVOS,
        select: { id: true },
      });
      const fila = await tx.usuario.findUnique({
        where: { id: usuarioId },
        include: conRolesVigentes,
      });
      if (fila === null) {
        return null;
      }
      const usuario = this.aUsuario(fila);
      // Si el cambio lanza un error (p. ej. la regla del último administrador), no se guarda nada.
      const auditoria =
        cambio(
          usuario,
          administradores.map((administrador) => administrador.id),
        ) ?? [];
      await this.guardarEn(tx, usuario);
      await insertarEventosAuditoria(tx, auditoria);
      return usuario;
    });
  }

  private async guardarEn(tx: Prisma.TransactionClient, usuario: Usuario): Promise<void> {
    await tx.usuario.update({
      where: { id: usuario.id },
      data: { ...this.datosPersonales(usuario), actualizado_en: new Date() },
    });
    for (const asignacion of usuario.asignaciones) {
      if (asignacion.id !== undefined && !asignacion.esVigente) {
        await tx.usuario_rol.updateMany({
          where: { id: asignacion.id, retirado_en: null },
          data: {
            retirado_por: asignacion.retiradoPor ?? null,
            retirado_en: asignacion.retiradoEn ?? null,
          },
        });
      }
    }
    const nuevas = usuario.asignaciones.filter(
      (asignacion) => asignacion.id === undefined && asignacion.esVigente,
    );
    if (nuevas.length > 0) {
      await tx.usuario_rol.createMany({
        data: nuevas.map((asignacion) => ({
          usuario_id: usuario.id,
          rol_codigo: asignacion.rol,
          asignado_por: asignacion.asignadoPor,
          asignado_en: asignacion.asignadoEn,
        })),
      });
    }
  }

  async obtenerEstadoSeguridad(
    usuarioId: string,
    sesionId: string,
  ): Promise<EstadoSeguridadUsuario | null> {
    if (!esUuid(usuarioId)) {
      return null;
    }
    const fila = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        activo: true,
        version_seguridad: true,
        debe_cambiar_clave: true,
        usuario_rol: { where: { retirado_en: null }, select: { rol_codigo: true } },
        sesion: esUuid(sesionId)
          ? { where: { id: sesionId }, select: { revocada_en: true } }
          : { where: { id: { in: [] } }, select: { revocada_en: true } },
      },
    });
    if (fila === null) {
      return null;
    }
    const [sesion] = fila.sesion;
    return {
      activo: fila.activo,
      versionSeguridad: fila.version_seguridad,
      roles: fila.usuario_rol.map((asignacion) => asignacion.rol_codigo).filter(esRol),
      debeCambiarClave: fila.debe_cambiar_clave,
      sesionRevocada: sesion === undefined || sesion.revocada_en !== null,
    };
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

/** Toma el bloqueo de aplicación de los administradores; se libera al terminar la transacción. */
const bloquearAdministradores = async (tx: Prisma.TransactionClient): Promise<void> => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BLOQUEO_ADMINISTRADORES}))`;
};
