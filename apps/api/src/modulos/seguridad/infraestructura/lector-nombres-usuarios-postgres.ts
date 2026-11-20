import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { LectorNombresUsuarios } from '../dominio/puertos/lector-nombres-usuarios';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee solo `id` y `nombre_completo` de `seguridad.usuario`. */
export class LectorNombresUsuariosPostgres implements LectorNombresUsuarios {
  constructor(private readonly prisma: PrismaServicio) {}

  async nombres(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const validos = [...new Set(ids.filter((id) => FORMATO_UUID.test(id)))];
    if (validos.length === 0) {
      return new Map();
    }
    const filas = await this.prisma.usuario.findMany({
      where: { id: { in: validos } },
      select: { id: true, nombre_completo: true },
    });
    return new Map(filas.map((fila) => [fila.id, fila.nombre_completo]));
  }

  async activosConRol(
    rol: string,
  ): Promise<readonly { readonly id: string; readonly nombre: string }[]> {
    const filas = await this.prisma.usuario.findMany({
      where: { activo: true, usuario_rol: { some: { rol_codigo: rol, retirado_en: null } } },
      select: { id: true, nombre_completo: true },
      orderBy: { nombre_completo: 'asc' },
    });
    return filas.map((fila) => ({ id: fila.id, nombre: fila.nombre_completo }));
  }
}
