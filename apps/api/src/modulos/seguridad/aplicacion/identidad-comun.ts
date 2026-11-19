import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import {
  crearIdentidadAdministrado,
  type DatosIdentidadAdministrado,
  ErrorIdentidadInvalida,
  type IdentidadAdministrado,
} from '../dominio/identidad-administrado';
import type { DatosIdentificacion } from '../dominio/puertos/servicio-identificacion';
import type { HuellasIdentidad } from '../dominio/verificacion-identidad';
import { ErrorDatosInvalidos } from './errores';

// Piezas que comparten los casos de uso de identidad del administrado (004).

/** Valida el formato; los errores llevan solo nombres de campos (FR-007). */
export const leerIdentidad = (datos: DatosIdentidadAdministrado): IdentidadAdministrado => {
  try {
    return crearIdentidadAdministrado(datos);
  } catch (error) {
    if (error instanceof ErrorIdentidadInvalida) {
      throw new ErrorDatosInvalidos(error.campos);
    }
    throw error;
  }
};

/** Clave estable del documento para la huella: tipo y número (un DNI y un CE no se confunden). */
const claveDocumento = (tipo: string, numero: string) => `${tipo}:${numero}`;

export const calcularHuellas = (
  identidad: IdentidadAdministrado,
  protector: ProtectorDatos,
): HuellasIdentidad => ({
  tipoDocumento: identidad.titular.tipoDocumento,
  documentoHmac: protector.hmac(
    claveDocumento(identidad.titular.tipoDocumento, identidad.titular.numeroDocumento),
  ),
  rucHmac: protector.hmac(identidad.ruc),
  celularHmac: protector.hmac(identidad.celular.valor),
  representanteHmac:
    identidad.representante === null
      ? null
      : protector.hmac(
          claveDocumento(
            identidad.representante.tipoDocumento,
            identidad.representante.numeroDocumento,
          ),
        ),
});

export const datosParaServicio = (identidad: IdentidadAdministrado): DatosIdentificacion => ({
  titular: { ...identidad.titular, ruc: identidad.ruc },
  representante: identidad.representante,
});

/** Hexadecimal de una huella, para las claves del limitador (sin `Buffer`, para la regla de capas). */
export const aHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
