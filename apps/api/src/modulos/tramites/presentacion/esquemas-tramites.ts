import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';

// Forma de los cuerpos del contrato (docs/06-contrato-api/openapi.yaml). Aquí solo se revisa la
// forma; las reglas del trámite (requisitos, bodega ≤ 50 m², identidad confirmada) son del dominio y
// de los casos de uso. Los mensajes nunca repiten el valor recibido (FR-035).

const documentoIdentidad = {
  tipoDocumento: z.enum(['DNI', 'CE'], 'Debe ser DNI o CE'),
  numeroDocumento: z
    .string('Debe ser un texto')
    .regex(/^[0-9A-Z]{8,12}$/, 'El número de documento no es válido'),
  fechaEmision: z.iso.date('Debe ser una fecha AAAA-MM-DD').optional(),
};

export const esquemaIdentidadSolicitud = z.strictObject({
  ...documentoIdentidad,
  ruc: z.string('Debe ser un texto').regex(/^(10|15|17|20)[0-9]{9}$/, 'El RUC no es válido'),
  celular: z
    .string('Debe ser un texto')
    .regex(/^9[0-9]{8}$/, 'El celular debe tener 9 dígitos y empezar con 9'),
  representante: z.strictObject(documentoIdentidad).optional(),
});

const textoOpcional = (maximo: number) =>
  z
    .string('Debe ser un texto')
    .max(maximo, `No puede superar ${String(maximo)} caracteres`)
    .nullable()
    .optional()
    .transform((valor) => valor ?? null);

export const esquemaNuevaSolicitud = z.strictObject({
  codigoReceta: z
    .string('Debe ser un texto')
    .regex(/^(LIC-0[1-9]|TRF-01|CGI-01|DUP-01)$/, 'No es una licencia del catálogo'),
  expedienteOrigen: z
    .string()
    .regex(/^EXP-[0-9]{4}-[0-9]{6}$/, 'No es un número de expediente válido')
    .nullable()
    .optional()
    .transform((valor) => valor ?? null),
  identidad: esquemaIdentidadSolicitud,
  nombreTitular: z.string('Debe ser un texto').max(150, 'No puede superar 150 caracteres'),
  razonSocial: textoOpcional(200),
  correo: z
    .email('El correo no es válido')
    .nullable()
    .optional()
    .transform((valor) => valor ?? null),
  nombreComercial: textoOpcional(200),
  giro: z.string('Debe ser un texto').max(150, 'No puede superar 150 caracteres'),
  direccion: z.string('Debe ser un texto').max(300, 'No puede superar 300 caracteres'),
  zona: z.string('Debe ser un texto').max(60, 'No puede superar 60 caracteres'),
  areaM2: z
    .number('Debe ser un número')
    .positive('Debe ser mayor que 0')
    .nullable()
    .optional()
    .transform((valor) => valor ?? null),
  documentos: z
    .array(
      z.strictObject({
        requisitoId: z.number('Debe ser un número').int('Debe ser un número entero'),
        documentoId: z.uuid('No es un documento válido'),
      }),
      'Debe ser una lista',
    )
    .max(30, 'No puede tener más de 30 documentos'),
});

export type NuevaSolicitudValidada = z.infer<typeof esquemaNuevaSolicitud>;

/** `documentos.0.documentoId` → `documentos[0].documentoId`. */
const aCampo = (ruta: readonly PropertyKey[]): string =>
  ruta.reduce<string>((campo, parte) => {
    if (typeof parte === 'number') {
      return `${campo}[${String(parte)}]`;
    }
    return campo === '' ? String(parte) : `${campo}.${String(parte)}`;
  }, '');

/** Valida un cuerpo y, si falla, lanza 422 con todos los campos a la vez. */
export const validarConEsquema = <T extends z.ZodType>(esquema: T, cuerpo: unknown): z.infer<T> => {
  const resultado = esquema.safeParse(cuerpo ?? {});
  if (resultado.success) {
    return resultado.data;
  }
  throw new ErrorValidacion(
    resultado.error.issues.flatMap((problema) => {
      const base = aCampo(problema.path);
      if (problema.code === 'unrecognized_keys') {
        return problema.keys.map((clave) => ({
          campo: base === '' ? clave : `${base}.${clave}`,
          mensaje: 'Este campo no se admite',
        }));
      }
      return [{ campo: base === '' ? 'cuerpo' : base, mensaje: problema.message }];
    }),
  );
};
