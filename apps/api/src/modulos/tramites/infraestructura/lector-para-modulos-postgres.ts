import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { Ruta } from '../dominio/maquina-estados';
import type { DatosParaLicencia, LectorParaModulos } from '../dominio/puertos/lector-para-modulos';

const comoRuta = (valor: string): Ruta => {
  const ruta = valor.trim();
  if (ruta !== 'A' && ruta !== 'B' && ruta !== 'C') {
    throw new Error('Ruta de expediente desconocida en la base');
  }
  return ruta;
};

/** Lecturas del expediente para otros módulos (006): solo las columnas que cada uno necesita. */
export class LectorParaModulosPostgres implements LectorParaModulos {
  constructor(
    private readonly prisma: PrismaServicio,
    private readonly protector: ProtectorDatos,
  ) {}

  async datosParaLicencia(numero: string): Promise<DatosParaLicencia | null> {
    const fila = await this.prisma.expediente.findUnique({
      where: { numero },
      select: {
        numero: true,
        codigo_receta: true,
        ruta: true,
        nombre_comercial: true,
        giro: true,
        zona: true,
        razon_social: true,
        nombre_titular: true,
        receta_al_presentar: true,
      },
    });
    if (fila === null) {
      return null;
    }
    const receta = fila.receta_al_presentar as { vigenciaMeses?: unknown } | null;
    return {
      numeroExpediente: fila.numero,
      codigoReceta: fila.codigo_receta,
      ruta: comoRuta(fila.ruta),
      nombreComercial: fila.nombre_comercial,
      giro: fila.giro,
      zona: fila.zona,
      razonSocial: fila.razon_social,
      nombreTitular: fila.nombre_titular,
      vigenciaMeses: typeof receta?.vigenciaMeses === 'number' ? receta.vigenciaMeses : null,
    };
  }

  async resumenesParaInspeccion(
    numeros: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly giro: string; readonly nombreLicencia: string }>> {
    if (numeros.length === 0) {
      return new Map();
    }
    const filas = await this.prisma.expediente.findMany({
      where: { numero: { in: [...new Set(numeros)] } },
      select: { numero: true, giro: true, codigo_receta: true, receta_al_presentar: true },
    });
    return new Map(
      filas.map((fila) => {
        const receta = fila.receta_al_presentar as { nombre?: unknown } | null;
        return [
          fila.numero,
          {
            giro: fila.giro,
            nombreLicencia: typeof receta?.nombre === 'string' ? receta.nombre : fila.codigo_receta,
          },
        ];
      }),
    );
  }

  async direccionDelLocal(numero: string): Promise<string | null> {
    const fila = await this.prisma.expediente.findUnique({
      where: { numero },
      select: { direccion_cifrada: true },
    });
    return fila === null ? null : this.protector.descifrar(fila.direccion_cifrada);
  }
}
