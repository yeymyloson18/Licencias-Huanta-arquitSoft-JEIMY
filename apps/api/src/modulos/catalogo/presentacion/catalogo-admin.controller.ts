import { Body, Controller, Get, Logger, Param, Put, Res } from '@nestjs/common';
import type { components } from '@licencias/contracts';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';
import { ActualizarReceta } from '../aplicacion/actualizar-receta';
import { ListarRecetasAdmin } from '../aplicacion/listar-recetas-admin';
import { ObtenerRecetaAdmin } from '../aplicacion/obtener-receta-admin';
import { CodigoReceta } from '../dominio/codigo-receta';
import { ErrorValidacionReceta } from '../dominio/error-validacion-receta';
import type { RecetaCompleta } from '../dominio/receta-completa';
import { leerRecetaEditable } from './esquemas-catalogo';
import { mapearReceta } from './mapear-receta';

type RecetaAdminResumen = components['schemas']['RecetaAdminResumen'];
type RecetaAdmin = components['schemas']['RecetaAdmin'];

const SIN_CACHE = 'no-store';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

/** Valida el formato del código de receta; otro valor → 422 sin repetir lo recibido. */
const validarCodigo = (codigo: string): string => {
  try {
    return CodigoReceta.crear(codigo).valor;
  } catch {
    throw new ErrorValidacion([
      { campo: 'codigoReceta', mensaje: 'No es un código de receta del TUPA' },
    ]);
  }
};

const aRecetaAdmin = (receta: RecetaCompleta): RecetaAdmin => ({
  ...mapearReceta(receta),
  activa: receta.activa,
  actualizadaEn: receta.actualizadaEn.toISOString(),
});

/**
 * Gestión del catálogo: solo ADMINISTRADOR (FR-015, contracts/catalogo-admin.md de la 003). Ninguna
 * respuesta se guarda en caché. El `GET` público de `catalogo/recetas/:codigoReceta` está en
 * `CatalogoController`; aquí solo el `PUT` de la misma ruta.
 */
@Controller()
@RequiereRoles('ADMINISTRADOR')
export class CatalogoAdminController {
  private readonly registro = new Logger('Catalogo');

  constructor(
    private readonly listarRecetasAdmin: ListarRecetasAdmin,
    private readonly obtenerRecetaAdmin: ObtenerRecetaAdmin,
    private readonly actualizarReceta: ActualizarReceta,
  ) {}

  @Get('admin/catalogo/recetas')
  async listar(
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<RecetaAdminResumen[]> {
    respuesta.setHeader('Cache-Control', SIN_CACHE);
    const recetas = await this.listarRecetasAdmin.ejecutar();
    return recetas.map((receta) => ({
      codigo: receta.codigo.valor,
      nombre: receta.nombre,
      tipo: receta.tipo,
      ruta: receta.ruta,
      tasa: receta.tasa.aTextoSoles(),
      plazoDias: receta.plazoDias?.dias ?? null,
      activa: receta.activa,
      actualizadaEn: receta.actualizadaEn.toISOString(),
    }));
  }

  @Get('admin/catalogo/recetas/:codigoReceta')
  async obtener(
    @Param('codigoReceta') codigoReceta: string,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<RecetaAdmin> {
    // Antes de validar: también los 404 y 422 llevan no-store.
    respuesta.setHeader('Cache-Control', SIN_CACHE);
    const receta = await this.obtenerRecetaAdmin.ejecutar(validarCodigo(codigoReceta));
    if (!receta) {
      throw ErrorProblema.noEncontrado();
    }
    return aRecetaAdmin(receta);
  }

  @Put('catalogo/recetas/:codigoReceta')
  async actualizar(
    @Param('codigoReceta') codigoReceta: string,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<RecetaAdmin> {
    respuesta.setHeader('Cache-Control', SIN_CACHE);
    const codigo = validarCodigo(codigoReceta);
    const lectura = leerRecetaEditable(cuerpo);
    if (!lectura.valido) {
      throw new ErrorValidacion(lectura.errores);
    }

    let resultado;
    try {
      resultado = await this.actualizarReceta.ejecutar(codigo, lectura.cambios, usuario.usuarioId);
    } catch (error) {
      if (error instanceof ErrorValidacionReceta) {
        throw new ErrorValidacion(error.errores);
      }
      throw error;
    }

    if (resultado.tipo === 'NO_ENCONTRADA') {
      throw ErrorProblema.noEncontrado();
    }
    if (resultado.campos.length > 0) {
      // Solo identificadores y nombres de campos: sin valores ni datos personales (FR-026).
      this.registro.log(
        `receta actualizada codigo=${codigo} usuarioId=${usuario.usuarioId} campos=${resultado.campos.join(',')}`,
      );
    }
    return aRecetaAdmin(resultado.receta);
  }
}
