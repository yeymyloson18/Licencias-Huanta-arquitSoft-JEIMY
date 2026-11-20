import type { INestApplication } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { DespachadorEventos } from '../../src/compartido/infraestructura/despachador-eventos';

// Apoyo de las pruebas de la 005: lleva expedientes sembrados (expedientes-prueba.ts de la 004) a un
// estado dado directamente en la base, siembra esquelas y procesa la cola de eventos una vez. Así cada
// historia se prueba sin depender del flujo completo. Datos FICTICIOS.

export type EstadoDePrueba =
  'REGISTRADO' | 'EN_EVALUACION' | 'OBSERVADO' | 'PENDIENTE_PAGO' | 'PAGADO' | 'DENEGADO';

/** Cambia el estado (y opcionalmente la ruta) y devuelve la versión nueva para `If-Match`. */
export const llevarAEstado = async (
  prisma: PrismaClient,
  numero: string,
  estado: EstadoDePrueba,
  opciones: { readonly ruta?: 'A' | 'B' | 'C' } = {},
): Promise<number> => {
  const fila = await prisma.expediente.update({
    where: { numero },
    data: { estado, ...(opciones.ruta ? { ruta: opciones.ruta } : {}), version: { increment: 1 } },
    select: { version: true },
  });
  return fila.version;
};

export const versionDe = async (prisma: PrismaClient, numero: string): Promise<number> =>
  (await prisma.expediente.findUniqueOrThrow({ where: { numero }, select: { version: true } }))
    .version;

/** Inserta la esquela pendiente de un expediente, como la crearía el módulo de pagos. */
export const sembrarEsquela = async (
  prisma: PrismaClient,
  numero: string,
  monto = '177.10',
): Promise<string> => {
  const codigo = `ESQ-${numero}`;
  await prisma.esquela.create({
    data: {
      codigo,
      numero_expediente: numero,
      codigo_receta: 'LIC-02',
      concepto: 'Licencia de funcionamiento – riesgo medio',
      monto: new Prisma.Decimal(monto),
    },
  });
  return codigo;
};

/** Procesa la cola de eventos una vez (en las pruebas el temporizador está apagado). */
export const procesarEventos = (app: INestApplication) =>
  app.get(DespachadorEventos).procesarPendientes();

/** Borra lo que crean las pruebas de pagos (auditoría y esquelas). */
export const limpiarPagos = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$transaction([prisma.auditoriaPagos.deleteMany(), prisma.esquela.deleteMany()]);
};
