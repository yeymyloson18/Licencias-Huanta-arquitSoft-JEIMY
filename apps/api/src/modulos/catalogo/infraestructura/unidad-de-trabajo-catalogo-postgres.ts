import { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { RecetaCompleta } from '../dominio/receta-completa';
import type {
  GuardadoReceta,
  ResultadoUnidadDeTrabajo,
  TrabajoReceta,
  UnidadDeTrabajoCatalogo,
} from '../dominio/unidad-de-trabajo-catalogo';
import { aRecetaCompleta, CON_REQUISITOS } from './repositorio-catalogo-postgres';

type Transaccion = Prisma.TransactionClient;

/** Tiempo máximo de la transacción: el trabajo es una función pura y unas pocas sentencias. */
const TIEMPO_MAXIMO_MS = 15_000;

const leerReceta = async (tx: Transaccion, codigo: string): Promise<RecetaCompleta> => {
  const fila = await tx.receta.findUniqueOrThrow({ where: { codigo }, ...CON_REQUISITOS });
  return aRecetaCompleta(fila);
};

/** Aplica la lista nueva de requisitos por `id` (research §R-04): update, insert y delete. */
const guardarRequisitos = async (
  tx: Transaccion,
  antes: RecetaCompleta,
  despues: RecetaCompleta,
): Promise<void> => {
  const conservados = new Set<number>();
  for (const requisito of despues.requisitos) {
    if (requisito.id !== null) {
      conservados.add(requisito.id);
    }
  }
  const borrados = antes.requisitos
    .map((requisito) => requisito.id)
    .filter((id): id is number => id !== null && !conservados.has(id));
  if (borrados.length > 0) {
    await tx.requisito.deleteMany({
      where: { codigo_receta: antes.codigo.valor, id: { in: borrados.map(BigInt) } },
    });
  }

  // La restricción única (codigo_receta, orden) es diferible: se verifica al confirmar.
  for (const requisito of despues.requisitos) {
    const datos = {
      orden: requisito.orden,
      descripcion: requisito.descripcion,
      obligatorio: requisito.obligatorio,
      condicion: requisito.condicion,
    };
    if (requisito.id === null) {
      await tx.requisito.create({ data: { codigo_receta: antes.codigo.valor, ...datos } });
    } else {
      await tx.requisito.update({ where: { id: BigInt(requisito.id) }, data: datos });
    }
  }
};

const guardar = async (
  tx: Transaccion,
  antes: RecetaCompleta,
  { receta, diferencias, usuarioId, en }: GuardadoReceta,
): Promise<void> => {
  const codigo = antes.codigo.valor;

  await tx.receta.update({
    where: { codigo },
    data: {
      tasa: new Prisma.Decimal(receta.tasa.aTextoSoles()),
      plazo_dias: receta.plazoDias?.dias ?? null,
      calificacion: receta.calificacion,
      orden_itse: receta.ordenItse,
      plazo_itse_dias: receta.plazoItseDias,
      vigencia_meses: receta.vigenciaMeses,
      activa: receta.activa,
      actualizada_por: usuarioId,
      actualizada_en: en,
    },
  });

  if (diferencias.requisitos !== undefined) {
    await guardarRequisitos(tx, antes, receta);
  }

  await tx.cambio_receta.create({
    data: {
      codigo_receta: codigo,
      usuario_id: usuarioId,
      cambiado_en: en,
      cambios: diferencias as Prisma.InputJsonObject,
    },
  });
};

/**
 * Adaptador de la unidad de trabajo con una transacción de PostgreSQL (research §R-04 y §R-05 de la
 * 003). `SELECT … FOR UPDATE` ordena los guardados simultáneos: el "antes" de cada registro es lo
 * guardado en ese momento. Si el trabajo lanza o falla una sentencia, se revierte todo (FR-021).
 */
export class UnidadDeTrabajoCatalogoPostgres implements UnidadDeTrabajoCatalogo {
  constructor(private readonly prisma: PrismaServicio) {}

  ejecutar<T>(
    codigo: string,
    trabajo: (receta: RecetaCompleta) => TrabajoReceta<T>,
  ): Promise<ResultadoUnidadDeTrabajo<T> | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const bloqueadas = await tx.$queryRaw<{ codigo: string }[]>`
          SELECT codigo FROM catalogo.receta WHERE codigo = ${codigo} FOR UPDATE`;
        if (bloqueadas.length === 0) {
          return null;
        }

        const antes = await leerReceta(tx, codigo);
        const { guardar: aGuardar, resultado } = trabajo(antes);
        if (aGuardar === null) {
          return { receta: antes, resultado };
        }

        await guardar(tx, antes, aGuardar);
        return { receta: await leerReceta(tx, codigo), resultado };
      },
      { timeout: TIEMPO_MAXIMO_MS },
    );
  }
}
