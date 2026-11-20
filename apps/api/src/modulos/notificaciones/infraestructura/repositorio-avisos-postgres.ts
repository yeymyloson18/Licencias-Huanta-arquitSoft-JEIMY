import type { Prisma } from '@prisma/client';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { Canal, DatosAviso } from '../dominio/aviso';
import type { AvisoPorEnviar, RepositorioAvisos } from '../dominio/puertos';

/** Mientras se envía un aviso, queda reservado este tiempo para que otra réplica no lo tome. */
const RESERVA_MS = 2 * 60 * 1000;

interface FilaPendiente {
  readonly id: string;
  readonly canal: string;
  readonly destino_cifrado: Uint8Array;
  readonly plantilla: string;
  readonly datos: Prisma.JsonValue;
  readonly intentos: number;
}

/** `notificaciones.mensaje` (data-model §5 de la 006): destino cifrado y un aviso por evento. */
export class RepositorioAvisosPostgres implements RepositorioAvisos {
  constructor(
    private readonly prisma: PrismaServicio,
    private readonly protector: ProtectorDatos,
  ) {}

  async crearSiNoExiste(aviso: {
    readonly eventoId: bigint;
    readonly canal: Canal;
    readonly destino: string;
    readonly datos: DatosAviso;
    readonly en: Date;
  }): Promise<boolean> {
    const { plantilla, ...datos } = aviso.datos;
    const insertados = await this.prisma.$executeRaw`
      INSERT INTO notificaciones.mensaje
        (canal, destino_cifrado, plantilla, datos, numero_expediente, evento_id, creado_en)
      VALUES (${aviso.canal}, ${Buffer.from(this.protector.cifrar(aviso.destino))}, ${plantilla},
              ${JSON.stringify(datos)}::jsonb, ${aviso.datos.numeroExpediente}, ${aviso.eventoId},
              ${aviso.en})
      ON CONFLICT (evento_id) DO NOTHING`;
    return insertados > 0;
  }

  tomarPendientes(limite: number, ahora: Date): Promise<AvisoPorEnviar[]> {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<FilaPendiente[]>`
        SELECT id, canal, destino_cifrado, plantilla, datos, intentos
          FROM notificaciones.mensaje
         WHERE estado = 'PENDIENTE' AND (reintentar_en IS NULL OR reintentar_en <= ${ahora})
         ORDER BY creado_en
         LIMIT ${limite}
           FOR UPDATE SKIP LOCKED`;
      if (filas.length > 0) {
        await tx.mensaje.updateMany({
          where: { id: { in: filas.map((fila) => fila.id) } },
          data: { reintentar_en: new Date(ahora.getTime() + RESERVA_MS) },
        });
      }
      return filas.map((fila) => ({
        id: fila.id,
        canal: fila.canal as Canal,
        destino: this.protector.descifrar(fila.destino_cifrado),
        datos: { ...(fila.datos as object), plantilla: fila.plantilla } as DatosAviso,
        intentos: fila.intentos,
      }));
    });
  }

  async marcarEnviado(id: string, en: Date): Promise<void> {
    await this.prisma.mensaje.update({
      where: { id },
      data: { estado: 'ENVIADO', enviado_en: en, reintentar_en: null },
    });
  }

  async marcarFallo(
    id: string,
    intentos: number,
    nombreError: string,
    reintentarEn: Date | null,
  ): Promise<void> {
    await this.prisma.mensaje.update({
      where: { id },
      data: {
        intentos,
        ultimo_error: nombreError,
        reintentar_en: reintentarEn,
        ...(reintentarEn === null ? { estado: 'FALLIDO' } : {}),
      },
    });
  }
}
