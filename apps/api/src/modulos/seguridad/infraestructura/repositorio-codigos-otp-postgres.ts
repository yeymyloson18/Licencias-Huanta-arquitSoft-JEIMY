import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { CodigoOtp } from '../dominio/codigo-otp';
import type { RepositorioCodigosOtp } from '../dominio/puertos/repositorio-codigos-otp';
import { aBytes, esUuid } from './uuid';

const PROPOSITO = 'INICIO_SESION';

/** Adaptador de `seguridad.codigo_otp` para los códigos de inicio de sesión del personal. */
export class RepositorioCodigosOtpPostgres implements RepositorioCodigosOtp {
  constructor(private readonly prisma: PrismaServicio) {}

  async crear(codigo: CodigoOtp): Promise<void> {
    await this.prisma.codigo_otp.create({
      data: {
        id: codigo.id,
        proposito: PROPOSITO,
        usuario_id: codigo.usuarioId,
        destino_hmac: aBytes(codigo.destinoHmac),
        codigo_hash: codigo.codigoHash,
        intentos: codigo.intentos,
        vence_en: codigo.venceEn,
        usado_en: codigo.usadoEn ?? null,
      },
    });
  }

  async obtenerPorId(id: string): Promise<CodigoOtp | null> {
    if (!esUuid(id)) {
      return null;
    }
    const fila = await this.prisma.codigo_otp.findFirst({ where: { id, proposito: PROPOSITO } });
    if (fila?.usuario_id == null) {
      return null;
    }
    return CodigoOtp.reconstruir({
      id: fila.id,
      usuarioId: fila.usuario_id,
      destinoHmac: fila.destino_hmac,
      codigoHash: fila.codigo_hash,
      intentos: fila.intentos,
      venceEn: fila.vence_en,
      usadoEn: fila.usado_en ?? undefined,
    });
  }

  async guardar(codigo: CodigoOtp): Promise<void> {
    await this.prisma.codigo_otp.update({
      where: { id: codigo.id },
      data: {
        intentos: codigo.intentos,
        vence_en: codigo.venceEn,
        usado_en: codigo.usadoEn ?? null,
      },
    });
  }

  async vencerVigentesDelUsuario(usuarioId: string, ahora: Date): Promise<void> {
    await this.prisma.codigo_otp.updateMany({
      where: {
        usuario_id: usuarioId,
        proposito: PROPOSITO,
        usado_en: null,
        vence_en: { gt: ahora },
      },
      data: { vence_en: ahora },
    });
  }
}
