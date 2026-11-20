import { Body, Controller, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { type Solicitante, SolicitanteActual, SolicitanteGuard } from '../../seguridad/fachada';
import { type ExpedienteSubsanado, SubsanarObservacion } from '../aplicacion/subsanar-observacion';
import { esquemaIdentidadSolicitud, validarConEsquema } from './esquemas-tramites';
import { traducirErrorTramites } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const PATRON_NUMERO = /^EXP-[0-9]{4}-[0-9]{6}$/;

const esquemaSubsanacion = z.strictObject({
  identidad: esquemaIdentidadSolicitud.optional(),
  documentos: z
    .array(
      z.strictObject({
        requisitoId: z.number('Debe ser un número').int('Debe ser un número entero'),
        documentoId: z.uuid('No es un documento válido'),
      }),
      'Debe ser una lista',
    )
    .min(1, 'Adjunta al menos un documento')
    .max(30, 'No puede tener más de 30 documentos'),
});

/** Esquema `ExpedienteRegistrado` del contrato. */
const aRespuesta = (expediente: ExpedienteSubsanado) => ({
  numero: expediente.numero,
  estado: expediente.estado,
  ruta: expediente.ruta,
  codigoReceta: expediente.codigoReceta,
  nombreLicencia: expediente.nombreLicencia,
  canal: expediente.canal,
  presentadoEn: expediente.presentadoEn.toISOString(),
  vencePlazoEn:
    expediente.vencePlazoEn === null ? null : expediente.vencePlazoEn.toISOString().slice(0, 10),
  siguientePaso: expediente.siguientePaso,
});

/** Subsanar la observación (historia 4 de la 005): el titular en línea o mesa de partes. */
@Controller('expedientes')
export class SubsanacionController {
  constructor(private readonly subsanarObservacion: SubsanarObservacion) {}

  @Post(':numeroExpediente/subsanar')
  @HttpCode(200)
  @UseGuards(SolicitanteGuard)
  async subsanar(
    @Param('numeroExpediente') numeroExpediente: string,
    @Body() cuerpo: unknown,
    @SolicitanteActual() solicitante: Solicitante,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const numero = numeroExpediente.trim().toUpperCase();
    if (!PATRON_NUMERO.test(numero)) {
      throw ErrorProblema.noEncontrado();
    }
    const datos = validarConEsquema(esquemaSubsanacion, cuerpo ?? {});
    try {
      return aRespuesta(
        await this.subsanarObservacion.ejecutar({
          numero,
          canal:
            solicitante.canal === 'EN_LINEA'
              ? { tipo: 'EN_LINEA', verificacionId: solicitante.verificacionId }
              : { tipo: 'MESA_PARTES', usuarioId: solicitante.usuarioId },
          identidad: datos.identidad ?? null,
          documentos: datos.documentos,
        }),
      );
    } catch (error) {
      throw traducirErrorTramites(error);
    }
  }
}
