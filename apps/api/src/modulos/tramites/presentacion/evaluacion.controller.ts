import { Body, Controller, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';
import { ObtenerDetalleExpediente } from '../aplicacion/bandeja-expedientes';
import {
  ConfirmarRiesgo,
  DenegarExpediente,
  IniciarEvaluacion,
  ObservarExpediente,
} from '../aplicacion/decisiones-evaluador';
import { LicenciasDelGrupo } from '../aplicacion/licencias-del-grupo';
import { NumeroExpediente } from '../dominio/numero-expediente';
import { aDetalle } from './bandeja.controller';
import { validarConEsquema } from './esquemas-tramites';
import { traducirErrorTramites } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

/** `If-Match` con la versión leída: `3`, `"3"` o `W/"3"`. Obligatoria (contrato). */
const leerVersion = (cabecera: string | undefined): number => {
  const coincidencia = /^(?:W\/)?"?(\d{1,9})"?$/.exec(cabecera?.trim() ?? '');
  if (coincidencia === null) {
    throw new ErrorValidacion([
      { campo: 'If-Match', mensaje: 'Envía la versión del expediente que leíste' },
    ]);
  }
  return Number(coincidencia[1]);
};

/** Un número con formato inválido no puede existir: se responde como no encontrado (404). */
const leerNumero = (texto: string): string => {
  try {
    return NumeroExpediente.normalizar(texto).valor;
  } catch {
    return texto;
  }
};

const esquemaRiesgo = z.strictObject({
  codigoReceta: z
    .string('Debe ser un texto')
    .regex(/^LIC-0[1-9]$/, 'No es una licencia del catálogo')
    .optional(),
  comentario: z
    .string('Debe ser un texto')
    .max(1000, 'No puede superar 1,000 caracteres')
    .optional(),
});

const esquemaObservar = z.strictObject({
  descripcion: z.string('Debe ser un texto'),
  plazoSubsanarEn: z.iso.date('Debe ser una fecha AAAA-MM-DD').optional(),
});

const esquemaDenegar = z.strictObject({ motivo: z.string('Debe ser un texto') });

/**
 * Decisiones del evaluador (CU13 de la 005, contracts/openapi-cambios.md): empezar la revisión,
 * confirmar o corregir el riesgo, observar y denegar. Responden el detalle actualizado, sin caché.
 */
@Controller('expedientes')
export class EvaluacionController {
  constructor(
    private readonly iniciarEvaluacion: IniciarEvaluacion,
    private readonly confirmarRiesgo: ConfirmarRiesgo,
    private readonly observarExpediente: ObservarExpediente,
    private readonly denegarExpediente: DenegarExpediente,
    private readonly obtenerDetalle: ObtenerDetalleExpediente,
    private readonly licenciasDelGrupo: LicenciasDelGrupo,
  ) {}

  @Post(':numeroExpediente/evaluacion')
  @HttpCode(200)
  @RequiereRoles('EVALUADOR')
  iniciar(
    @Param('numeroExpediente') numero: string,
    @Headers('if-match') ifMatch: string | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    return this.decidir(numero, ifMatch, usuario, respuesta, (decisor) =>
      this.iniciarEvaluacion.ejecutar(decisor),
    );
  }

  @Post(':numeroExpediente/riesgo')
  @HttpCode(200)
  @RequiereRoles('EVALUADOR')
  riesgo(
    @Param('numeroExpediente') numero: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    const datos = validarConEsquema(esquemaRiesgo, cuerpo);
    return this.decidir(numero, ifMatch, usuario, respuesta, (decisor) =>
      this.confirmarRiesgo.ejecutar({
        ...decisor,
        codigoReceta: datos.codigoReceta ?? null,
        comentario: datos.comentario?.trim() || null,
      }),
    );
  }

  @Post(':numeroExpediente/observar')
  @HttpCode(200)
  @RequiereRoles('EVALUADOR')
  observar(
    @Param('numeroExpediente') numero: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    const datos = validarConEsquema(esquemaObservar, cuerpo);
    return this.decidir(numero, ifMatch, usuario, respuesta, (decisor) =>
      this.observarExpediente.ejecutar({
        ...decisor,
        descripcion: datos.descripcion,
        plazoSubsanarEn:
          datos.plazoSubsanarEn === undefined
            ? null
            : new Date(`${datos.plazoSubsanarEn}T00:00:00Z`),
      }),
    );
  }

  @Post(':numeroExpediente/denegar')
  @HttpCode(200)
  @RequiereRoles('EVALUADOR')
  denegar(
    @Param('numeroExpediente') numero: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    const datos = validarConEsquema(esquemaDenegar, cuerpo);
    return this.decidir(numero, ifMatch, usuario, respuesta, (decisor) =>
      this.denegarExpediente.ejecutar({ ...decisor, motivo: datos.motivo }),
    );
  }

  /** Lee `If-Match`, ejecuta la decisión y responde el detalle actualizado (sin `VER_DETALLE`). */
  private async decidir(
    numeroEnRuta: string,
    ifMatch: string | undefined,
    usuario: UsuarioAutenticado,
    respuesta: RespuestaHttp,
    accion: (decisor: { numero: string; version: number; usuarioId: string }) => Promise<void>,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const version = leerVersion(ifMatch);
    const numero = leerNumero(numeroEnRuta);
    try {
      await accion({ numero, version, usuarioId: usuario.usuarioId });
      const detalle = await this.obtenerDetalle.ejecutar({
        numero,
        usuarioId: usuario.usuarioId,
        registrarVista: false,
      });
      return aDetalle(detalle, await this.licenciasDelGrupo.ejecutar(detalle));
    } catch (error) {
      throw traducirErrorTramites(error);
    }
  }
}
