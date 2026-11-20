import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FachadaTramites } from '../../tramites/fachada';
import type { EmitirLicencia } from '../aplicacion/emitir-licencia';
import type { RegistrarCertificado } from '../aplicacion/registrar-certificado';
import type { DatosExpedienteParaLicencia } from '../dominio/licencia';
import type { ExpedientesParaLicencia, GeneradorAleatorio, Reloj } from '../dominio/puertos';

export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}

export class GeneradorAleatorioCrypto implements GeneradorAleatorio {
  bytes(cantidad: number): Uint8Array {
    return new Uint8Array(randomBytes(cantidad));
  }
}

/** Adaptador de `ExpedientesParaLicencia` sobre la fachada de Trámites (principio I). */
export class ExpedientesFachadaTramites implements ExpedientesParaLicencia {
  constructor(private readonly tramites: FachadaTramites) {}

  async datosParaLicencia(numero: string): Promise<DatosExpedienteParaLicencia | null> {
    const datos = await this.tramites.datosParaLicencia(numero);
    return datos === null
      ? null
      : {
          numeroExpediente: datos.numeroExpediente,
          codigoReceta: datos.codigoReceta,
          nombreComercial: datos.nombreComercial,
          giro: datos.giro,
          zona: datos.zona,
          razonSocial: datos.razonSocial,
          nombreTitular: datos.nombreTitular,
          vigenciaMeses: datos.vigenciaMeses,
        };
  }
}

/** El evento no tiene la forma esperada; el despachador lo reintenta y avisa cada 10 fallos. */
export class ErrorEventoInvalidoLicencias extends Error {
  constructor(tipo: string) {
    super(`Evento ${tipo} inválido`);
    this.name = 'ErrorEventoInvalidoLicencias';
  }
}

const NUMERO_EXPEDIENTE = z.string().regex(/^EXP-[0-9]{4}-[0-9]{6}$/);

/** Los datos de los eventos son planos: el certificado viaja en dos campos (ruta B). */
const esquemaLicenciaSolicitada = z.object({
  numeroExpediente: NUMERO_EXPEDIENTE,
  tipo: z.enum(['DEFINITIVA', 'PROVISIONAL']),
  certificadoNumero: z.string().min(4).max(30).optional(),
  certificadoEmitidoEn: z.iso.date().optional(),
});

const esquemaCertificadoRegistrado = z.object({
  numeroExpediente: NUMERO_EXPEDIENTE,
  numero: z.string().min(4).max(30),
  emitidoEn: z.iso.date(),
});

/** `LicenciaSolicitada` → emite la licencia (research §R-01 de la 006). */
export const manejadorLicenciaSolicitada =
  (emitir: EmitirLicencia) =>
  async (datos: unknown): Promise<void> => {
    const evento = esquemaLicenciaSolicitada.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoLicencias('LicenciaSolicitada');
    }
    const { certificadoNumero, certificadoEmitidoEn } = evento.data;
    await emitir.ejecutar({
      numeroExpediente: evento.data.numeroExpediente,
      tipo: evento.data.tipo,
      certificado:
        certificadoNumero === undefined || certificadoEmitidoEn === undefined
          ? null
          : { numero: certificadoNumero, emitidoEn: certificadoEmitidoEn },
    });
  };

/** `CertificadoItseRegistrado` → certificado en la licencia vigente (ITSE posterior o de bodega). */
export const manejadorCertificadoRegistrado =
  (registrar: RegistrarCertificado) =>
  async (datos: unknown): Promise<void> => {
    const evento = esquemaCertificadoRegistrado.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoLicencias('CertificadoItseRegistrado');
    }
    await registrar.ejecutar(evento.data);
  };
