// FR-014 de la 012 (research R-07; Ley N.° 29733, principio VII): antes de que un texto salga hacia el
// proveedor externo se reemplazan los datos personales por una marca neutra. Función pura.
//
// El orden importa: primero los correos, después los celulares (con +51, espacios o guiones), luego
// los RUC (11 dígitos), los DNI (8) y los carnés de extranjería (9). Así un RUC no se corta como si
// fuera un DNI más un resto. Los números de expediente, años, áreas y montos no tienen esas formas.

export const MARCA_DATO_PERSONAL = '[dato personal]';

const PATRONES: readonly RegExp[] = [
  // Correo.
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Celular: 9 dígitos que empiezan con 9, con o sin +51, espacios o guiones.
  /(?<![\d])(?:\+?51[\s-]?)?9(?:[\s-]?\d){8}(?![\d])/g,
  // RUC: 11 dígitos que empiezan con 10, 15, 17 o 20.
  /(?<![\d])(?:10|15|17|20)\d{9}(?![\d])/g,
  // DNI: 8 dígitos.
  /(?<![\d])\d{8}(?![\d])/g,
  // Carné de extranjería: 9 dígitos.
  /(?<![\d])\d{9}(?![\d])/g,
];

export interface TextoSinDatosPersonales {
  readonly texto: string;
  /** Se reemplazó al menos un dato (activa el aviso de FR-016). */
  readonly quitados: boolean;
}

export const quitarDatosPersonales = (texto: string): TextoSinDatosPersonales => {
  let resultado = texto;
  for (const patron of PATRONES) {
    resultado = resultado.replace(patron, MARCA_DATO_PERSONAL);
  }
  return { texto: resultado, quitados: resultado !== texto };
};
