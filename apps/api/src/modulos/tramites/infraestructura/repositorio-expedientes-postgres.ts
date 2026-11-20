import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { esEstadoExpediente, type EstadoExpediente } from '../dominio/estado-publico';
import type { NumeroExpediente } from '../dominio/numero-expediente';
import type {
  ExpedienteConsultado,
  RepositorioExpedientes,
} from '../dominio/puertos/repositorio-expedientes';
import { aBytes } from './comun-postgres';

const comoEstado = (valor: string): EstadoExpediente => {
  if (!esEstadoExpediente(valor)) {
    throw new Error('Estado de expediente desconocido en la base');
  }
  return valor;
};

const comoRuta = (valor: string): 'A' | 'B' | 'C' => {
  const ruta = valor.trim();
  if (ruta !== 'A' && ruta !== 'B' && ruta !== 'C') {
    throw new Error('Ruta de expediente desconocida en la base');
  }
  return ruta;
};

/**
 * Lecturas de expedientes en PostgreSQL. La consulta pública busca por número y por la huella del
 * documento o del RUC del titular (research §R-12): el documento en claro nunca llega a la base.
 */
export class RepositorioExpedientesPostgres implements RepositorioExpedientes {
  constructor(
    private readonly prisma: PrismaServicio,
    private readonly protector: ProtectorDatos,
  ) {}

  async buscarParaConsulta(
    numero: NumeroExpediente,
    documento: string,
  ): Promise<ExpedienteConsultado | null> {
    const huella = aBytes(this.protector.hmac(documento));
    const fila = await this.prisma.expediente.findFirst({
      where: { numero: numero.valor, OR: [{ documento_hmac: huella }, { ruc_hmac: huella }] },
      select: {
        numero: true,
        estado: true,
        ruta: true,
        codigo_receta: true,
        presentado_en: true,
        vence_plazo_en: true,
        receta_al_presentar: true,
        historial_estado: {
          select: { estado_nuevo: true, ocurrido_en: true },
          orderBy: { ocurrido_en: 'asc' },
        },
      },
    });
    if (fila === null) {
      return null;
    }
    const receta = fila.receta_al_presentar as { nombre?: unknown } | null;
    return {
      numero: fila.numero,
      estado: comoEstado(fila.estado),
      ruta: comoRuta(fila.ruta),
      nombreLicencia: typeof receta?.nombre === 'string' ? receta.nombre : fila.codigo_receta,
      presentadoEn: fila.presentado_en,
      vencePlazoEn: fila.vence_plazo_en,
      historial: fila.historial_estado.map((registro) => ({
        estado: comoEstado(registro.estado_nuevo),
        ocurridoEn: registro.ocurrido_en,
      })),
    };
  }
}
