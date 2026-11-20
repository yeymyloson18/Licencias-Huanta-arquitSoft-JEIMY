import { Body, Controller, Get, Param, Patch, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';
import {
  ConsultarAuditoriaPagos,
  type RegistroAuditoriaPagos,
} from '../aplicacion/consultar-auditoria-pagos';
import { CorregirNumeroRecibo, ErrorReciboCambiado } from '../aplicacion/corregir-numero-recibo';
import { aRespuestaEsquela, leerCodigo } from './esquelas.controller';
import { traducirErrorPagos } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const esquemaCorreccion = z.strictObject({
  numeroRecibo: z.string('Debe ser un texto'),
  motivo: z.string('Debe ser un texto'),
});

const entero = (campo: string, minimo: number, maximo: number, porDefecto: number) =>
  z
    .string()
    .optional()
    .transform((valor, contexto) => {
      if (valor === undefined || valor === '') {
        return porDefecto;
      }
      const numero = Number(valor);
      if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
        contexto.addIssue({
          code: 'custom',
          path: [campo],
          message: `Debe ser un entero entre ${String(minimo)} y ${String(maximo)}`,
        });
        return z.NEVER;
      }
      return numero;
    });

const esquemaFiltro = z.object({
  pagina: entero('pagina', 1, 1_000_000, 1),
  porPagina: entero('porPagina', 1, 50, 20),
  desde: z.iso.date('Debe ser una fecha AAAA-MM-DD').optional(),
  hasta: z.iso.date('Debe ser una fecha AAAA-MM-DD').optional(),
});

/** Esquema `RegistroAuditoria` del contrato. */
const aRegistro = (registro: RegistroAuditoriaPagos) => ({
  usuarioId: registro.usuarioId,
  nombreUsuario: registro.nombreUsuario,
  accion: registro.accion,
  referencia: registro.referencia,
  detalle: { ...registro.detalle },
  ocurridoEn: registro.ocurridoEn.toISOString(),
});

/** Corrección de recibos y auditoría de pagos (historia 6 de la 005, rol JEFATURA). */
@Controller()
export class AuditoriaPagosController {
  constructor(
    private readonly corregirNumeroRecibo: CorregirNumeroRecibo,
    private readonly consultarAuditoria: ConsultarAuditoriaPagos,
  ) {}

  @Patch('esquelas/:codigoEsquela/recibo')
  @RequiereRoles('JEFATURA')
  async corregir(
    @Param('codigoEsquela') codigo: string,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const datos = esquemaCorreccion.safeParse(cuerpo ?? {});
    if (!datos.success) {
      throw new ErrorValidacion(
        datos.error.issues.map((problema) => ({
          campo: String(problema.path[0] ?? 'cuerpo'),
          mensaje: 'Escribe el número de recibo y el motivo',
        })),
      );
    }
    try {
      return aRespuestaEsquela(
        await this.corregirNumeroRecibo.ejecutar({
          codigo: leerCodigo(codigo),
          numeroRecibo: datos.data.numeroRecibo,
          motivo: datos.data.motivo,
          usuarioId: usuario.usuarioId,
        }),
      );
    } catch (error) {
      if (error instanceof ErrorReciboCambiado) {
        throw ErrorProblema.reciboCambiado();
      }
      throw traducirErrorPagos(error);
    }
  }

  @Get('pagos/auditoria')
  @RequiereRoles('JEFATURA')
  async auditoria(
    @Query() consulta: Record<string, string | undefined>,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const filtro = esquemaFiltro.safeParse(consulta);
    if (!filtro.success) {
      throw new ErrorValidacion(
        filtro.error.issues.map((problema) => ({
          campo: String(problema.path[0] ?? 'consulta'),
          mensaje: problema.message,
        })),
      );
    }
    try {
      const pagina = await this.consultarAuditoria.ejecutar({
        pagina: filtro.data.pagina,
        porPagina: filtro.data.porPagina,
        desde: filtro.data.desde ?? null,
        hasta: filtro.data.hasta ?? null,
      });
      return { ...pagina, datos: pagina.datos.map(aRegistro) };
    } catch (error) {
      throw traducirErrorPagos(error);
    }
  }
}
