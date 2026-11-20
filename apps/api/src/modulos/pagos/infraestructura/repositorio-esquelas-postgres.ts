import { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { Esquela } from '../dominio/esquela';
import type {
  RepositorioEsquelas,
  ResultadoRegistroPago,
} from '../dominio/puertos/repositorio-esquelas';

/** ¿Violó el índice único del recibo (`ux_esquela_recibo`)? */
const esReciboRepetido = (error: unknown): boolean =>
  (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
  (error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2010' &&
    JSON.stringify(error.meta ?? {}).includes('ux_esquela_recibo'));

/** Ya lo decidió otra transacción: el resultado viaja como excepción para deshacer la transacción. */
class ResultadoAnticipado extends Error {
  constructor(readonly resultado: ResultadoRegistroPago) {
    super(resultado);
  }
}

/** Adaptador de `pagos.esquela` y `pagos.auditoria` (ADR-004: una esquela por expediente). */
export class RepositorioEsquelasPostgres implements RepositorioEsquelas {
  constructor(private readonly prisma: PrismaServicio) {}

  async crearSiNoExiste(esquela: Esquela): Promise<boolean> {
    const datos = esquela.aDatos();
    // ON CONFLICT DO NOTHING: si el evento se entrega dos veces, la segunda no duplica.
    const insertadas = await this.prisma.$executeRaw`
      INSERT INTO pagos.esquela (codigo, numero_expediente, codigo_receta, concepto, monto, generada_en)
      VALUES (${datos.codigo}, ${datos.numeroExpediente}, ${datos.codigoReceta}, ${datos.concepto},
              ${new Prisma.Decimal(datos.monto)}, ${datos.generadaEn})
      ON CONFLICT DO NOTHING`;
    return insertadas > 0;
  }

  async obtener(codigo: string): Promise<Esquela | null> {
    const fila = await this.prisma.esquela.findUnique({ where: { codigo } });
    if (fila === null) {
      return null;
    }
    const pagada =
      fila.numero_recibo !== null && fila.pagada_en !== null && fila.registrado_por !== null;
    return Esquela.reconstruir({
      codigo: fila.codigo,
      numeroExpediente: fila.numero_expediente,
      codigoReceta: fila.codigo_receta,
      concepto: fila.concepto,
      monto: fila.monto.toFixed(2),
      generadaEn: fila.generada_en,
      pago: pagada
        ? {
            numeroRecibo: fila.numero_recibo ?? '',
            pagadaEn: fila.pagada_en ?? fila.generada_en,
            registradoPor: fila.registrado_por ?? '',
          }
        : null,
    });
  }

  async registrarPago(esquelaPagada: Esquela): Promise<ResultadoRegistroPago> {
    const datos = esquelaPagada.aDatos();
    const pago = datos.pago;
    if (pago === null) {
      throw new Error('registrarPago necesita una esquela con su pago');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // La base decide: solo una transacción encuentra la esquela sin recibo (FR-022).
        const { count } = await tx.esquela.updateMany({
          where: { codigo: datos.codigo, numero_recibo: null },
          data: {
            numero_recibo: pago.numeroRecibo,
            pagada_en: pago.pagadaEn,
            registrado_por: pago.registradoPor,
          },
        });
        if (count === 0) {
          throw new ResultadoAnticipado('YA_PAGADA');
        }
        await tx.auditoriaPagos.create({
          data: {
            usuario_id: pago.registradoPor,
            accion: 'REGISTRAR_PAGO',
            codigo_esquela: datos.codigo,
            recibo_nuevo: pago.numeroRecibo,
            ocurrido_en: pago.pagadaEn,
          },
        });
        await tx.evento_pendiente.create({
          data: {
            tipo: 'PagoRegistrado',
            datos: { numeroExpediente: datos.numeroExpediente, codigoEsquela: datos.codigo },
          },
        });
      });
      return 'REGISTRADO';
    } catch (error) {
      if (error instanceof ResultadoAnticipado) {
        return error.resultado;
      }
      if (esReciboRepetido(error)) {
        return 'RECIBO_REPETIDO';
      }
      throw error;
    }
  }
}
