import { Prisma } from '@prisma/client';
import { comoFechaBase, deFechaBase, type Fecha } from '../../../compartido/dominio/fecha-lima';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { crearCertificado, Licencia, type TipoLicencia } from '../dominio/licencia';
import type { RepositorioLicencias, ResultadoEmision } from '../dominio/puertos';

const CON_CERTIFICADO = {
  certificado_itse: { orderBy: { emitido_en: 'desc' as const }, take: 1 },
} satisfies Prisma.licenciaInclude;

type FilaLicencia = Prisma.licenciaGetPayload<{ include: typeof CON_CERTIFICADO }>;

const aLicencia = (fila: FilaLicencia): Licencia => {
  const certificado = fila.certificado_itse[0];
  return Licencia.reconstruir({
    numero: fila.numero,
    numeroExpediente: fila.numero_expediente,
    codigoReceta: fila.codigo_receta,
    tipo: fila.tipo as TipoLicencia,
    nombreComercial: fila.nombre_comercial,
    giro: fila.giro,
    zona: fila.zona,
    titularPublico: fila.titular_publico,
    codigoVerificacion: fila.codigo_verificacion,
    emitidaEn: fila.emitida_en,
    vigenteHasta: fila.vigente_hasta === null ? null : deFechaBase(fila.vigente_hasta),
    certificado:
      certificado === undefined
        ? null
        : {
            numero: certificado.numero,
            emitidoEn: deFechaBase(certificado.emitido_en),
            venceEn: deFechaBase(certificado.vence_en),
          },
  });
};

const esUnicoRepetido = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const eventoEmitida = (licencia: Licencia) => {
  const datos = licencia.aDatos();
  return {
    tipo: 'LicenciaEmitida',
    datos: {
      numeroExpediente: datos.numeroExpediente,
      numeroLicencia: datos.numero,
      tipo: datos.tipo,
    },
  };
};

/**
 * `licencias.*` en PostgreSQL (data-model §3 de la 006). La emisión, la auditoría (usuario NULL) y el
 * evento `LicenciaEmitida` van en una transacción; el índice `ux_licencia_vigente_por_expediente`
 * impide una segunda licencia vigente.
 */
export class RepositorioLicenciasPostgres implements RepositorioLicencias {
  constructor(private readonly prisma: PrismaServicio) {}

  async vigenteDe(numeroExpediente: string): Promise<Licencia | null> {
    const fila = await this.prisma.licencia.findFirst({
      where: { numero_expediente: numeroExpediente, estado: 'VIGENTE' },
      include: CON_CERTIFICADO,
    });
    return fila === null ? null : aLicencia(fila);
  }

  async porNumero(numero: string): Promise<Licencia | null> {
    const fila = await this.prisma.licencia.findUnique({
      where: { numero },
      include: CON_CERTIFICADO,
    });
    return fila === null ? null : aLicencia(fila);
  }

  async porCodigo(codigoVerificacion: string): Promise<Licencia | null> {
    const fila = await this.prisma.licencia.findUnique({
      where: { codigo_verificacion: codigoVerificacion },
      include: CON_CERTIFICADO,
    });
    return fila === null ? null : aLicencia(fila);
  }

  async emitir(armar: (correlativo: number) => Licencia): Promise<ResultadoEmision> {
    try {
      const licencia = await this.prisma.$transaction(async (tx) => {
        const [{ correlativo }] = await tx.$queryRaw<[{ correlativo: bigint }]>`
          SELECT nextval('licencias.numero_licencia_seq') AS correlativo`;
        const nueva = armar(Number(correlativo));
        const datos = nueva.aDatos();
        const fila = await tx.licencia.create({
          data: {
            numero: datos.numero,
            numero_expediente: datos.numeroExpediente,
            codigo_receta: datos.codigoReceta,
            tipo: datos.tipo,
            nombre_comercial: datos.nombreComercial,
            giro: datos.giro,
            zona: datos.zona,
            titular_publico: datos.titularPublico,
            codigo_verificacion: datos.codigoVerificacion,
            emitida_en: datos.emitidaEn,
            vigente_hasta: datos.vigenteHasta === null ? null : comoFechaBase(datos.vigenteHasta),
          },
        });
        if (datos.certificado !== null) {
          await tx.certificado_itse.create({
            data: {
              licencia_id: fila.id,
              numero: datos.certificado.numero,
              emitido_en: comoFechaBase(datos.certificado.emitidoEn),
              vence_en: comoFechaBase(datos.certificado.venceEn),
            },
          });
        }
        await tx.auditoriaLicencias.create({
          data: {
            usuario_id: null,
            accion: datos.tipo === 'PROVISIONAL' ? 'EMITIR_PROVISIONAL' : 'EMITIR',
            numero_licencia: datos.numero,
            numero_expediente: datos.numeroExpediente,
            ocurrido_en: datos.emitidaEn,
          },
        });
        await tx.evento_pendiente.create({ data: eventoEmitida(nueva) });
        return nueva;
      });
      return { tipo: 'EMITIDA', licencia };
    } catch (error) {
      if (!esUnicoRepetido(error)) {
        throw error;
      }
      // Otra entrega del mismo evento ganó la carrera: el expediente ya tiene su licencia.
      const existente = await this.vigenteDe(this.numeroExpedienteDe(armar));
      if (existente === null) {
        throw error;
      }
      return { tipo: 'YA_EXISTIA', licencia: existente };
    }
  }

  async publicarEmitida(licencia: Licencia): Promise<void> {
    await this.prisma.evento_pendiente.create({ data: eventoEmitida(licencia) });
  }

  async registrarCertificado(
    numeroExpediente: string,
    certificado: { readonly numero: string; readonly emitidoEn: Fecha },
  ): Promise<'REGISTRADO' | 'YA_EXISTIA' | 'SIN_LICENCIA'> {
    const licencia = await this.prisma.licencia.findFirst({
      where: { numero_expediente: numeroExpediente, estado: 'VIGENTE' },
      select: { id: true },
    });
    if (licencia === null) {
      return 'SIN_LICENCIA';
    }
    const completo = crearCertificado(certificado.numero, certificado.emitidoEn);
    const insertados = await this.prisma.$executeRaw`
      INSERT INTO licencias.certificado_itse (licencia_id, numero, emitido_en, vence_en)
      VALUES (${licencia.id}::uuid, ${completo.numero}, ${completo.emitidoEn}::date, ${completo.venceEn}::date)
      ON CONFLICT (numero) DO NOTHING`;
    return insertados > 0 ? 'REGISTRADO' : 'YA_EXISTIA';
  }

  /** El número de expediente que tendría la licencia (para releer tras una carrera). */
  private numeroExpedienteDe(armar: (correlativo: number) => Licencia): string {
    return armar(0).numeroExpediente;
  }
}
