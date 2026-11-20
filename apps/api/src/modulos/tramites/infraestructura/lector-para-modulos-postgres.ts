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
  constructor(private readonly prisma: PrismaServicio) {}

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
}
