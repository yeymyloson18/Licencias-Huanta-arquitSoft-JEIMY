import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ConsultarEstado, type EstadoPublico } from '../aplicacion/consultar-estado';
import { ErrorLimitadorConsultasNoDisponible } from '../dominio/puertos/limitador-consultas';
import { validarConEsquema } from './esquemas-tramites';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

interface PeticionConIp {
  /** Con `trust proxy` = `TRUST_PROXY_SALTOS` (002): nunca se lee `X-Forwarded-For` a mano. */
  readonly ip?: string;
}

// Patrones del contrato; el número se acepta con espacios alrededor y en minúsculas.
const esquemaConsulta = z.strictObject({
  numeroExpediente: z
    .string('Debe ser un texto')
    .transform((valor) => valor.trim().toUpperCase())
    .pipe(z.string().regex(/^EXP-[0-9]{4}-[0-9]{6}$/, 'Debe tener el formato EXP-AAAA-NNNNNN')),
  documento: z
    .string('Debe ser un texto')
    .transform((valor) => valor.trim().toUpperCase())
    .pipe(z.string().regex(/^[0-9A-Z]{8,12}$/, 'Debe ser un DNI, carné de extranjería o RUC')),
});

/** `vence_plazo_en` es una fecha (sin hora) en el contrato. */
const aFecha = (fecha: Date | null) => (fecha === null ? null : fecha.toISOString().slice(0, 10));

const aRespuesta = (estado: EstadoPublico) => ({
  numero: estado.numero,
  estado: estado.estado,
  descripcionEstado: estado.descripcionEstado,
  siguientePaso: estado.siguientePaso,
  ruta: estado.ruta,
  nombreLicencia: estado.nombreLicencia,
  presentadoEn: estado.presentadoEn.toISOString(),
  vencePlazoEn: aFecha(estado.vencePlazoEn),
  historial: estado.historial.map((registro) => ({
    estado: registro.estado,
    descripcion: registro.descripcion,
    ocurridoEn: registro.ocurridoEn.toISOString(),
  })),
  // 005: esquela (si ya existe), token para descargarla y observaciones por subsanar.
  ...(estado.esquela === null
    ? {}
    : {
        codigoEsquela: estado.esquela.codigo,
        montoEsquela: estado.esquela.monto,
        esquelaPagada: estado.esquela.pagada,
      }),
  ...(estado.tokenConsulta === null ? {} : { tokenConsulta: estado.tokenConsulta }),
  ...(estado.observacionesPendientes.length === 0
    ? {}
    : { observacionesPendientes: [...estado.observacionesPendientes] }),
  ...(estado.requisitosSubsanables.length === 0
    ? {}
    : { requisitosSubsanables: estado.requisitosSubsanables.map((r) => ({ ...r })) }),
});

/** Consulta pública del estado del trámite (CU05 de la 004, contracts/consulta-y-bandeja.md). */
@Controller('expedientes')
export class ConsultaController {
  constructor(private readonly consultarEstado: ConsultarEstado) {}

  @Post('consultar')
  @HttpCode(200)
  async consultar(
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConIp,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    // Un formato inválido responde 422 y no cuenta como intento fallido.
    const datos = validarConEsquema(esquemaConsulta, cuerpo);

    let resultado;
    try {
      resultado = await this.consultarEstado.ejecutar({
        ...datos,
        origen: peticion.ip ?? 'desconocido',
      });
    } catch (error) {
      if (error instanceof ErrorLimitadorConsultasNoDisponible) {
        throw ErrorProblema.intentosNoDisponibles();
      }
      throw error;
    }
    switch (resultado.tipo) {
      case 'ENCONTRADO':
        return aRespuesta(resultado.estado);
      case 'NO_ENCONTRADO':
        // El mismo cuerpo si el número no existe o el documento no coincide (EQ-04).
        throw ErrorProblema.noEncontrado();
      case 'BLOQUEADO':
        throw ErrorProblema.demasiadosIntentos(resultado.segundosRestantes);
    }
  }
}
