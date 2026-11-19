import { z } from 'zod';
import type { ErrorCampo } from '../../../compartido/presentacion/filtro-problema';
import type { CambiosReceta } from '../dominio/cambios-receta';
import { LONGITUD_MAXIMA_DESCRIPCION } from '../dominio/requisito';

// Forma del cuerpo `RecetaEditable` del contrato (docs/06-contrato-api/openapi.yaml). Aquí solo se
// revisa la forma; las reglas del TUPA (límites, coherencia con la ruta, `id` de la receta) son del
// dominio (`aplicarCambios`). Los mensajes nunca repiten el valor recibido (FR-026).

const MENSAJE_ENTERO = 'Debe ser un entero mayor o igual a 1';

const enteroPositivo = z.number(MENSAJE_ENTERO).int(MENSAJE_ENTERO).min(1, MENSAJE_ENTERO);

const requisito = z.strictObject({
  id: z.number('Debe ser un número entero').int('Debe ser un número entero').optional(),
  /** Obsoleto en el contrato: se ignora, manda la posición en la lista (FR-020). */
  orden: enteroPositivo.optional(),
  descripcion: z
    .string('Debe ser un texto')
    .min(1, 'No puede estar vacía')
    .max(
      LONGITUD_MAXIMA_DESCRIPCION,
      `No puede superar ${String(LONGITUD_MAXIMA_DESCRIPCION)} caracteres`,
    ),
  obligatorio: z.boolean('Debe ser verdadero o falso').optional(),
  condicion: z.enum(
    ['SIEMPRE', 'CON_REPRESENTANTE', 'GIRO_ESPECIAL', 'SIN_PLANOS_VIGENTES'],
    'Debe ser SIEMPRE, CON_REPRESENTANTE, GIRO_ESPECIAL o SIN_PLANOS_VIGENTES',
  ),
});

export const esquemaRecetaEditable = z
  .strictObject({
    tasa: z
      .string('Debe ser un texto')
      .regex(/^[0-9]+\.[0-9]{2}$/, 'Debe ser un monto en soles con 2 decimales, como 159.50'),
    plazoDias: enteroPositivo,
    calificacion: z.enum(
      ['APROBACION_AUTOMATICA', 'EVALUACION_PREVIA_SILENCIO_POSITIVO', 'SERVICIO_EXCLUSIVO'],
      'Debe ser APROBACION_AUTOMATICA, EVALUACION_PREVIA_SILENCIO_POSITIVO o SERVICIO_EXCLUSIVO',
    ),
    ordenItse: z
      .enum(
        ['POSTERIOR', 'PREVIA', 'DENTRO_6_MESES'],
        'Debe ser POSTERIOR, PREVIA o DENTRO_6_MESES',
      )
      .nullable(),
    plazoItseDias: enteroPositivo.nullable(),
    vigenciaMeses: enteroPositivo.nullable(),
    activa: z.boolean('Debe ser verdadero o falso'),
    requisitos: z
      .array(requisito, 'Debe ser una lista')
      .min(1, 'Debe tener al menos un requisito')
      .max(30, 'No puede tener más de 30 requisitos'),
  })
  .partial();

/** `requisitos.0.descripcion` → `requisitos[0].descripcion` (mismo formato que el dominio). */
const aCampo = (ruta: readonly PropertyKey[]): string =>
  ruta.reduce<string>((campo, parte) => {
    if (typeof parte === 'number') {
      return `${campo}[${String(parte)}]`;
    }
    return campo === '' ? String(parte) : `${campo}.${String(parte)}`;
  }, '');

const aErroresCampo = (error: z.ZodError): ErrorCampo[] =>
  error.issues.flatMap((problema): ErrorCampo[] => {
    const base = aCampo(problema.path);
    if (problema.code === 'unrecognized_keys') {
      // Campos no editables (FR-018): código, nombre, tipo, ruta, código y página del TUPA…
      return problema.keys.map((clave) => ({
        campo: base === '' ? clave : `${base}.${clave}`,
        mensaje: 'Este campo no se puede modificar',
      }));
    }
    return [{ campo: base === '' ? 'cuerpo' : base, mensaje: problema.message }];
  });

export type ResultadoLectura =
  | { readonly valido: true; readonly cambios: CambiosReceta }
  | { readonly valido: false; readonly errores: ErrorCampo[] };

/** Valida la forma del cuerpo; todos los problemas se informan juntos. */
export const leerRecetaEditable = (cuerpo: unknown): ResultadoLectura => {
  const resultado = esquemaRecetaEditable.safeParse(cuerpo);
  if (!resultado.success) {
    return { valido: false, errores: aErroresCampo(resultado.error) };
  }
  // `minProperties: 1` del contrato: se revisa aparte para no sumarlo a los campos no editables.
  if (Object.keys(resultado.data).length === 0) {
    return {
      valido: false,
      errores: [{ campo: 'cuerpo', mensaje: 'Indique al menos un campo para cambiar' }],
    };
  }
  return { valido: true, cambios: resultado.data };
};
