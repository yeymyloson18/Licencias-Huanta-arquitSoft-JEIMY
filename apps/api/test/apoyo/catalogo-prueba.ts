import type { Prisma, PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

// Ayudas de las pruebas de edición del catálogo (historia 3 de la 003): guardar el estado de unas
// recetas antes de editarlas y dejarlas como estaban después, sin depender del orden de las pruebas.

type FilaReceta = Prisma.RecetaGetPayload<{ include: { requisito: true } }>;

export interface FotoRecetas {
  readonly filas: readonly FilaReceta[];
}

export const fotografiarRecetas = async (
  prisma: PrismaClient,
  codigos: readonly string[],
): Promise<FotoRecetas> => ({
  filas: await prisma.receta.findMany({
    where: { codigo: { in: [...codigos] } },
    include: { requisito: { orderBy: { orden: 'asc' } } },
  }),
});

/** Borra las claves de Redis del catálogo (fichas, listas y asistente). */
export const borrarCacheCatalogo = async (redis: Redis): Promise<void> => {
  const claves = await redis.keys('catalogo:*');
  if (claves.length > 0) {
    await redis.del(...claves);
  }
};

/**
 * Deja las recetas como en la foto (los requisitos se vuelven a crear con `id` nuevos), vacía
 * `cambio_receta` y borra la caché del catálogo.
 */
export const restaurarRecetas = async (
  prisma: PrismaClient,
  redis: Redis,
  foto: FotoRecetas,
): Promise<void> => {
  await prisma.$transaction([
    prisma.cambio_receta.deleteMany(),
    prisma.requisito.deleteMany({
      where: { codigo_receta: { in: foto.filas.map((fila) => fila.codigo) } },
    }),
    ...foto.filas.map(({ requisito, ...receta }) =>
      prisma.receta.update({
        where: { codigo: receta.codigo },
        data: {
          tasa: receta.tasa,
          plazo_dias: receta.plazo_dias,
          calificacion: receta.calificacion,
          orden_itse: receta.orden_itse,
          plazo_itse_dias: receta.plazo_itse_dias,
          vigencia_meses: receta.vigencia_meses,
          activa: receta.activa,
          actualizada_por: receta.actualizada_por,
          actualizada_en: receta.actualizada_en,
          requisito: {
            create: requisito.map((fila) => ({
              orden: fila.orden,
              descripcion: fila.descripcion,
              obligatorio: fila.obligatorio,
              condicion: fila.condicion,
              acepta_archivo: fila.acepta_archivo,
            })),
          },
        },
      }),
    ),
  ]);
  await borrarCacheCatalogo(redis);
};
