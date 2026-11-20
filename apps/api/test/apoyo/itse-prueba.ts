import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { DespachadorEventos } from '../../src/compartido/infraestructura/despachador-eventos';

// Apoyo de las pruebas de la 006: limpieza de inspecciones, licencias, alertas, avisos y feriados de
// prueba, y siembra directa de licencias e inspecciones. Datos FICTICIOS.

/** Usuario de sistema que registra los feriados sembrados por la migración 0010. */
export const USUARIO_SISTEMA = '00000000-0000-0000-0000-000000000000';

/** Borra todo lo de la 006, salvo los feriados sembrados por la migración. */
export const limpiar006 = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$transaction([
    prisma.foto.deleteMany(),
    prisma.auditoriaInspecciones.deleteMany(),
    prisma.inspeccion.deleteMany(),
    prisma.certificado_itse.deleteMany(),
    prisma.auditoriaLicencias.deleteMany(),
    prisma.licencia.deleteMany(),
    prisma.alerta.deleteMany(),
    prisma.mensaje.deleteMany(),
    prisma.feriado.deleteMany({ where: { registrado_por: { not: USUARIO_SISTEMA } } }),
  ]);
};

/** Inserta una licencia vigente, como la emitiría el módulo de licencias. */
export const sembrarLicencia = async (
  prisma: PrismaClient,
  numeroExpediente: string,
  opciones: {
    readonly tipo?: 'DEFINITIVA' | 'PROVISIONAL';
    readonly vigenteHasta?: Date | null;
  } = {},
): Promise<{ readonly numero: string; readonly codigoVerificacion: string }> => {
  const [{ correlativo }] = await prisma.$queryRaw<[{ correlativo: bigint }]>`
    SELECT nextval('licencias.numero_licencia_seq') AS correlativo`;
  const numero = `LF-2026-${String(correlativo).padStart(6, '0')}`;
  const codigoVerificacion = randomBytes(16).toString('base64url');
  await prisma.licencia.create({
    data: {
      numero,
      numero_expediente: numeroExpediente,
      codigo_receta: 'LIC-02',
      tipo: opciones.tipo ?? 'DEFINITIVA',
      nombre_comercial: 'Bodega de Prueba',
      giro: 'Bodega',
      zona: 'Centro',
      titular_publico: 'Titular D. P. U.',
      codigo_verificacion: codigoVerificacion,
      vigente_hasta: opciones.vigenteHasta ?? null,
    },
  });
  return { numero, codigoVerificacion };
};

/** Inserta una inspección (por defecto PENDIENTE), como la crearía el módulo de inspecciones. */
export const sembrarInspeccion = async (
  prisma: PrismaClient,
  numeroExpediente: string,
  opciones: {
    readonly tipo?: 'PREVIA' | 'POSTERIOR' | 'BODEGA';
    readonly inspectorId?: string;
    readonly programadaPara?: Date;
  } = {},
): Promise<string> => {
  const fila = await prisma.inspeccion.create({
    data: {
      numero_expediente: numeroExpediente,
      tipo: opciones.tipo ?? 'PREVIA',
      ...(opciones.inspectorId === undefined
        ? {}
        : {
            inspector_id: opciones.inspectorId,
            programada_para: opciones.programadaPara ?? new Date(),
            estado: 'ASIGNADA',
          }),
    },
  });
  return fila.id;
};

/**
 * Procesa la cola de eventos hasta que no quede nada por procesar (cada evento puede publicar el
 * siguiente: `LicenciaSolicitada` → `LicenciaEmitida` → `InspeccionRequerida`…).
 */
export const procesarTodo = async (app: INestApplication, pasadas = 6): Promise<void> => {
  const despachador = app.get(DespachadorEventos);
  for (let i = 0; i < pasadas; i += 1) {
    const resultado = await despachador.procesarPendientes();
    if (resultado === null || resultado.procesados + resultado.fallidos === 0) {
      return;
    }
  }
};
