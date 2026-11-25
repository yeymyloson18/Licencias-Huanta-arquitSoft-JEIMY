import { z } from 'zod';
import type { FuenteGuia, TemaGuia } from '../dominio/puertos';
import guiaDelModulo from './guia/guia-orientacion.json';

// Adaptador del puerto FuenteGuia (012, research R-03): la guía de preguntas frecuentes es un archivo
// de datos versionado, revisado en un PR. Se valida al construir (al arrancar la API): si es inválida,
// la API no arranca. Cambiarla no exige programar, pero sí un nuevo despliegue.

const esquemaTema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,40}$/),
    titulo: z.string().min(1).max(120),
    palabrasClave: z.array(z.string().min(1)).min(1).max(20),
    respuesta: z.string().min(1).max(1500),
    enlaces: z.array(z.enum(['FICHA', 'ASISTENTE', 'CONSULTA', 'LICENCIAS'])).default([]),
  })
  .strict();

const esquemaGuia = z.object({
  fuente: z.string().optional(),
  temas: z
    .array(esquemaTema)
    .min(1)
    .refine((temas) => new Set(temas.map((tema) => tema.id)).size === temas.length, {
      message: 'ids repetidos',
    }),
});

export class ErrorGuiaInvalida extends Error {
  constructor(detalle: string) {
    super(`La guía de orientación es inválida: ${detalle}`);
    this.name = 'ErrorGuiaInvalida';
  }
}

export class GuiaOrientacionArchivo implements FuenteGuia {
  private readonly lista: readonly TemaGuia[];

  constructor(datos: unknown = guiaDelModulo) {
    const resultado = esquemaGuia.safeParse(datos);
    if (!resultado.success) {
      throw new ErrorGuiaInvalida(
        resultado.error.issues
          .map((problema) => `${problema.path.join('.')} ${problema.message}`)
          .join('; '),
      );
    }
    this.lista = resultado.data.temas;
  }

  temas(): readonly TemaGuia[] {
    return this.lista;
  }
}
