import { Celular } from './celular';
import { ErrorDominio } from './error-dominio';

// Identidad del administrado que presenta una solicitud (RF06, FR-001 de la 004): RUC y, además, DNI
// con su fecha de emisión o carné de extranjería, el celular donde recibe el código y, si actúa, el
// representante legal o apoderado. Solo valida el formato; la coincidencia la decide el servicio de
// identificación.

export type TipoDocumento = 'DNI' | 'CE';

export interface DocumentoIdentidad {
  readonly tipoDocumento: TipoDocumento;
  readonly numeroDocumento: string;
  /** AAAA-MM-DD; solo para DNI. */
  readonly fechaEmision: string | null;
}

export interface IdentidadAdministrado {
  readonly titular: DocumentoIdentidad;
  readonly ruc: string;
  readonly celular: Celular;
  readonly representante: DocumentoIdentidad | null;
}

export interface DatosDocumentoIdentidad {
  readonly tipoDocumento: string;
  readonly numeroDocumento: string;
  readonly fechaEmision?: string | null;
}

export interface DatosIdentidadAdministrado extends DatosDocumentoIdentidad {
  readonly ruc: string;
  readonly celular: string;
  readonly representante?: DatosDocumentoIdentidad | null;
}

/** Datos con formato inválido: lleva solo los nombres de los campos, nunca los valores (FR-007). */
export class ErrorIdentidadInvalida extends ErrorDominio {
  constructor(readonly campos: readonly string[]) {
    super(`Datos de identidad inválidos: ${campos.join(', ')}`);
    this.name = 'ErrorIdentidadInvalida';
  }
}

const DNI = /^[0-9]{8}$/;
const CARNE_EXTRANJERIA = /^[0-9A-Z]{8,12}$/;
const RUC = /^(10|15|17|20)[0-9]{9}$/;
const FECHA = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

const esFechaReal = (texto: string): boolean => {
  const partes = FECHA.exec(texto);
  if (!partes) {
    return false;
  }
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
};

const leerDocumento = (
  datos: DatosDocumentoIdentidad,
  prefijo: string,
  campos: string[],
): DocumentoIdentidad | null => {
  const numero = datos.numeroDocumento.trim().toUpperCase();
  const fecha = datos.fechaEmision?.trim() ?? null;
  if (datos.tipoDocumento === 'DNI') {
    let valido = true;
    if (!DNI.test(numero)) {
      campos.push(`${prefijo}numeroDocumento`);
      valido = false;
    }
    if (fecha === null || !esFechaReal(fecha)) {
      campos.push(`${prefijo}fechaEmision`);
      valido = false;
    }
    return valido ? { tipoDocumento: 'DNI', numeroDocumento: numero, fechaEmision: fecha } : null;
  }
  if (datos.tipoDocumento === 'CE') {
    if (!CARNE_EXTRANJERIA.test(numero)) {
      campos.push(`${prefijo}numeroDocumento`);
      return null;
    }
    return { tipoDocumento: 'CE', numeroDocumento: numero, fechaEmision: null };
  }
  campos.push(`${prefijo}tipoDocumento`);
  return null;
};

/** Valida y normaliza la identidad; lanza `ErrorIdentidadInvalida` con todos los campos a la vez. */
export const crearIdentidadAdministrado = (
  datos: DatosIdentidadAdministrado,
): IdentidadAdministrado => {
  const campos: string[] = [];
  const titular = leerDocumento(datos, '', campos);
  const ruc = datos.ruc.trim();
  if (!RUC.test(ruc)) {
    campos.push('ruc');
  }
  let celular: Celular | null = null;
  try {
    celular = Celular.crear(datos.celular.trim());
  } catch {
    campos.push('celular');
  }
  const representante =
    datos.representante === undefined || datos.representante === null
      ? null
      : leerDocumento(datos.representante, 'representante.', campos);

  if (campos.length > 0 || titular === null || celular === null) {
    throw new ErrorIdentidadInvalida(campos);
  }
  return { titular, ruc, celular, representante };
};
