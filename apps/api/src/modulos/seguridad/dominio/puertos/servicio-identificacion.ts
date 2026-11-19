// Servicio externo de validación de DNI/RUC (RF06, research §R-02 de la 004). Aún no está
// contratado: hoy se usa un adaptador simulado, y cambiarlo por el real no toca los casos de uso
// (FR-004).

export type ResultadoIdentificacion = 'COINCIDE' | 'NO_COINCIDE' | 'NO_DISPONIBLE';

export interface PersonaAIdentificar {
  readonly tipoDocumento: 'DNI' | 'CE';
  readonly numeroDocumento: string;
  /** Fecha de emisión (AAAA-MM-DD); solo para DNI. */
  readonly fechaEmision: string | null;
}

export interface DatosIdentificacion {
  readonly titular: PersonaAIdentificar & { readonly ruc: string };
  /** Si actúa un representante, también se comprueba su documento (research §R-01). */
  readonly representante: PersonaAIdentificar | null;
}

export interface ServicioIdentificacion {
  /** Nunca lanza: cualquier falla o demora del proveedor responde `NO_DISPONIBLE`. */
  verificar(datos: DatosIdentificacion): Promise<ResultadoIdentificacion>;
}
