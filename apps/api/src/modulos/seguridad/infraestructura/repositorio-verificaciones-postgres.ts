import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { RepositorioVerificaciones } from '../dominio/puertos/repositorio-verificaciones';
import {
  type HuellasIdentidad,
  type ResultadoServicioRegistrado,
  VerificacionIdentidad,
} from '../dominio/verificacion-identidad';
import { aBytes, esUuid } from './uuid';

const PROPOSITO = 'IDENTIDAD_ADMINISTRADO';

const columnasHuellas = (huellas: HuellasIdentidad) => ({
  tipo_documento: huellas.tipoDocumento,
  documento_hmac: aBytes(huellas.documentoHmac),
  ruc_hmac: aBytes(huellas.rucHmac),
  con_representante: huellas.representanteHmac !== null,
  representante_documento_hmac:
    huellas.representanteHmac === null ? null : aBytes(huellas.representanteHmac),
});

/**
 * Adaptador de `seguridad.verificacion_identidad` y de su código en `seguridad.codigo_otp`
 * (propósito IDENTIDAD_ADMINISTRADO, sin usuario). La verificación y su código comparten el id, que es
 * el `desafioId` del contrato. Solo guarda huellas (research §R-05 de la 004).
 */
export class RepositorioVerificacionesPostgres implements RepositorioVerificaciones {
  constructor(private readonly prisma: PrismaServicio) {}

  async crear(verificacion: VerificacionIdentidad): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.codigo_otp.create({
        data: {
          id: verificacion.id,
          proposito: PROPOSITO,
          usuario_id: null,
          destino_hmac: aBytes(verificacion.huellas.celularHmac),
          codigo_hash: verificacion.codigoHash,
          intentos: verificacion.intentos,
          vence_en: verificacion.venceEn,
          usado_en: verificacion.confirmadaEn,
        },
      }),
      this.prisma.verificacion_identidad.create({
        data: {
          id: verificacion.id,
          ...columnasHuellas(verificacion.huellas),
          resultado_servicio: 'VALIDO',
          codigo_otp_id: verificacion.id,
          confirmada_en: verificacion.confirmadaEn,
        },
      }),
    ]);
  }

  async registrarRechazo(
    id: string,
    huellas: HuellasIdentidad,
    resultado: Exclude<ResultadoServicioRegistrado, 'VALIDO'>,
    en: Date,
  ): Promise<void> {
    await this.prisma.verificacion_identidad.create({
      data: { id, ...columnasHuellas(huellas), resultado_servicio: resultado, creada_en: en },
    });
  }

  async obtenerPorId(id: string): Promise<VerificacionIdentidad | null> {
    if (!esUuid(id)) {
      return null;
    }
    const fila = await this.prisma.verificacion_identidad.findUnique({
      where: { id },
      include: { codigo_otp: true },
    });
    if (fila?.resultado_servicio !== 'VALIDO' || fila.codigo_otp === null) {
      return null;
    }
    if (fila.tipo_documento !== 'DNI' && fila.tipo_documento !== 'CE') {
      throw new Error('Tipo de documento desconocido en una verificación de identidad');
    }
    return VerificacionIdentidad.reconstruir({
      id: fila.id,
      tipoDocumento: fila.tipo_documento,
      documentoHmac: fila.documento_hmac,
      rucHmac: fila.ruc_hmac,
      celularHmac: fila.codigo_otp.destino_hmac,
      representanteHmac: fila.representante_documento_hmac,
      codigoHash: fila.codigo_otp.codigo_hash,
      intentos: fila.codigo_otp.intentos,
      venceEn: fila.codigo_otp.vence_en,
      confirmadaEn: fila.confirmada_en,
    });
  }

  async guardar(verificacion: VerificacionIdentidad): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.codigo_otp.update({
        where: { id: verificacion.id },
        data: {
          intentos: verificacion.intentos,
          vence_en: verificacion.venceEn,
          usado_en: verificacion.confirmadaEn,
        },
      }),
      this.prisma.verificacion_identidad.update({
        where: { id: verificacion.id },
        data: { confirmada_en: verificacion.confirmadaEn },
      }),
    ]);
  }

  async vencerPendientesDelDocumento(documentoHmac: Uint8Array, ahora: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE seguridad.codigo_otp c
         SET vence_en = ${ahora}
        FROM seguridad.verificacion_identidad v
       WHERE v.codigo_otp_id = c.id
         AND v.documento_hmac = ${aBytes(documentoHmac)}
         AND c.proposito = ${PROPOSITO}
         AND c.usado_en IS NULL
         AND c.vence_en > ${ahora}`;
  }
}
