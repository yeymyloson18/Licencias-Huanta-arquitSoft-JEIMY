import { Controller, Get, Query, Res } from '@nestjs/common';
import type { components } from '@licencias/contracts';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { ListarRecetas } from '../aplicacion/listar-recetas';
import { esTipoReceta, TIPOS_RECETA, type TipoReceta } from '../dominio/receta';

type RecetaResumen = components['schemas']['RecetaResumen'];

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

// El contrato indica `Cache-Control: public, max-age=300` (contracts/catalogo-recetas.md).
const CACHE_HTTP = 'public, max-age=300';

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

/** GET /api/v1/catalogo/recetas: público (FR-012). */
@Controller()
export class CatalogoController {
  constructor(private readonly listarRecetas: ListarRecetas) {}

  @Get('catalogo/recetas')
  async listar(
    @Query('tipo') tipo: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<RecetaResumen[]> {
    const recetas = await this.listarRecetas.ejecutar({ tipo: validarTipo(tipo) });

    respuesta.setHeader('Cache-Control', CACHE_HTTP);
    return recetas.map((receta) => ({
      codigo: receta.codigo,
      nombre: receta.nombre,
      tipo: receta.tipo,
      ruta: receta.ruta,
      tasa: receta.tasa,
      plazoDias: receta.plazoDias,
    }));
  }
}
