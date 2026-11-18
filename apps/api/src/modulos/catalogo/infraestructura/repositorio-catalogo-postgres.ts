import type { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { crearReceta, esRuta, esTipoReceta, type Receta, type Ruta } from '../dominio/receta';
import { crearRecetaCompleta, type RecetaCompleta } from '../dominio/receta-completa';
import type { FiltroRecetas, RepositorioCatalogo } from '../dominio/repositorio-catalogo';

const CON_REQUISITOS = {
  include: { requisito: { orderBy: { orden: 'asc' } } },
} as const satisfies Prisma.RecetaDefaultArgs;

type FilaRecetaCompleta = Prisma.RecetaGetPayload<typeof CON_REQUISITOS>;

/** Los CHECK de esquema.sql garantizan estos valores; se validan igual al cruzar la frontera. */
const leerTipoYRuta = (fila: {
  codigo: string;
  tipo: string;
  ruta: string | null;
}): { tipo: Receta['tipo']; ruta: Ruta | null } => {
  if (!esTipoReceta(fila.tipo)) {
    throw new Error(`Tipo de receta desconocido en ${fila.codigo}`);
  }
  const ruta = fila.ruta?.trim() ?? null;
  if (ruta !== null && !esRuta(ruta)) {
    throw new Error(`Ruta desconocida en ${fila.codigo}`);
  }
  return { tipo: fila.tipo, ruta };
};

const aRecetaCompleta = (fila: FilaRecetaCompleta): RecetaCompleta =>
  crearRecetaCompleta({
    codigo: fila.codigo,
    nombre: fila.nombre,
    ...leerTipoYRuta(fila),
    codigoTupa: fila.codigo_tupa,
    paginaTupa: fila.pagina_tupa,
    nivelRiesgo: fila.nivel_riesgo,
    tasa: fila.tasa.toFixed(2),
    plazoDias: fila.plazo_dias,
    tipoPlazo: fila.tipo_plazo,
    calificacion: fila.calificacion,
    ordenItse: fila.orden_itse,
    plazoItseDias: fila.plazo_itse_dias,
    vigenciaMeses: fila.vigencia_meses,
    activa: fila.activa,
    requisitos: fila.requisito.map((requisito) => ({
      id: Number(requisito.id),
      orden: requisito.orden,
      descripcion: requisito.descripcion,
      obligatorio: requisito.obligatorio,
      condicion: requisito.condicion,
    })),
    actualizadaEn: fila.actualizada_en.toISOString(),
  });

/** Adaptador: lee el esquema `catalogo` (solo el esquema propio del módulo, principio III). */
export class RepositorioCatalogoPostgres implements RepositorioCatalogo {
  constructor(private readonly prisma: PrismaServicio) {}

  async listarActivas(filtro: FiltroRecetas): Promise<Receta[]> {
    const filas = await this.prisma.receta.findMany({
      where: { activa: true, ...(filtro.tipo ? { tipo: filtro.tipo } : {}) },
      orderBy: { codigo: 'asc' },
      select: { codigo: true, nombre: true, tipo: true, ruta: true, tasa: true, plazo_dias: true },
    });

    return filas.map((fila) =>
      crearReceta({
        codigo: fila.codigo,
        nombre: fila.nombre,
        ...leerTipoYRuta(fila),
        tasa: fila.tasa.toFixed(2),
        plazoDias: fila.plazo_dias,
      }),
    );
  }

  async obtener(codigo: string): Promise<RecetaCompleta | null> {
    const fila = await this.prisma.receta.findUnique({ where: { codigo }, ...CON_REQUISITOS });
    return fila ? aRecetaCompleta(fila) : null;
  }

  async listarTodas(): Promise<RecetaCompleta[]> {
    const filas = await this.prisma.receta.findMany({
      orderBy: { codigo: 'asc' },
      ...CON_REQUISITOS,
    });
    return filas.map(aRecetaCompleta);
  }
}
