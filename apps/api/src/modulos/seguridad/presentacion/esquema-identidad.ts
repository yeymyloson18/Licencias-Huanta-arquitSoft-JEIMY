import { z } from 'zod';

// Forma de `SolicitudVerificacionIdentidad` del contrato (docs/06-contrato-api/openapi.yaml). Las
// reglas finas (DNI de 8 dígitos, fecha de emisión real, celular que empieza con 9) las valida el
// dominio con `crearIdentidadAdministrado`.

const documento = {
  tipoDocumento: z.enum(['DNI', 'CE']),
  numeroDocumento: z.string().regex(/^[0-9A-Z]{8,12}$/),
  fechaEmision: z.iso.date().optional(),
};

export const esquemaIdentidad = z.object({
  ...documento,
  ruc: z.string().regex(/^(10|15|17|20)[0-9]{9}$/),
  celular: z.string(),
  representante: z.object(documento).optional(),
});

export type CuerpoIdentidad = z.infer<typeof esquemaIdentidad>;

export const MENSAJES_IDENTIDAD: Readonly<Record<string, string>> = {
  tipoDocumento: 'Debe ser DNI o CE',
  numeroDocumento: 'El número de documento no es válido',
  fechaEmision: 'La fecha de emisión es obligatoria para el DNI',
  ruc: 'El RUC no es válido',
  celular: 'El celular debe tener 9 dígitos y empezar con 9',
  representante: 'Los datos del representante no son válidos',
  'representante.tipoDocumento': 'Debe ser DNI o CE',
  'representante.numeroDocumento': 'El número de documento del representante no es válido',
  'representante.fechaEmision': 'La fecha de emisión del representante es obligatoria para el DNI',
};
