import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { components } from '@licencias/contracts';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { ListarRecetas } from '../aplicacion/listar-recetas';
import { ObtenerFicha } from '../aplicacion/obtener-ficha';
import { CodigoReceta } from '../dominio/codigo-receta';
import { esTipoReceta, TIPOS_RECETA, type TipoReceta } from '../dominio/receta';
import { mapearReceta } from './mapear-receta';

type RecetaResumen = components['schemas']['RecetaResumen'];
type Receta = components['schemas']['Receta'];

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

// contracts/openapi-cambios.md de la 003: 60 s en el navegador + 240 s como máximo en Redis = 5 min
// en el peor caso (FR-024). Un 404 no se guarda, para que una receta reactivada aparezca enseguida.
const CACHE_PUBLICA = 'public, max-age=60';
const SIN_CACHE = 'no-store';

/** Valida el parámetro `tipo` (un único valor del enum); otro valor → 422. */
const validarTipo = (tipo: unknown): TipoReceta | undefined => {
  if (tipo === undefined) {
    return undefined;
  }
  if (esTipoReceta(tipo)) {
    return tipo;
  }
  throw new ErrorValidacion([{ campo: 'tipo', mensaje: `Debe ser ${TIPOS_RECETA.join(' o ')}` }]);
};

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

/** Catálogo público: lista (FR-012 de la 001) y ficha de cada receta activa (FR-010, FR-014). */
@Controller()
export class CatalogoController {
  constructor(
    private readonly listarRecetas: ListarRecetas,
    private readonly obtenerFicha: ObtenerFicha,
  ) {}

  @Get('catalogo/recetas')
  async listar(
    @Query('tipo') tipo: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<RecetaResumen[]> {
    const recetas = await this.listarRecetas.ejecutar({ tipo: validarTipo(tipo) });

    respuesta.setHeader('Cache-Control', CACHE_PUBLICA);
    return recetas.map((receta) => ({
      codigo: receta.codigo,
      nombre: receta.nombre,
      tipo: receta.tipo,
      ruta: receta.ruta,
      tasa: receta.tasa,
      plazoDias: receta.plazoDias,
    }));
  }

  @Get('catalogo/recetas/:codigoReceta')
  async ficha(
    @Param('codigoReceta') codigoReceta: string,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<Receta> {
    const receta = await this.obtenerFicha.ejecutar(validarCodigo(codigoReceta));

    if (!receta) {
      // Mismo cuerpo si no existe o si está desactivada (contrato).
      respuesta.setHeader('Cache-Control', SIN_CACHE);
      throw ErrorProblema.noEncontrado();
    }
    respuesta.setHeader('Cache-Control', CACHE_PUBLICA);
    return mapearReceta(receta);
  }
}
