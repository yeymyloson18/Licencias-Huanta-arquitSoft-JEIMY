import type { DatosIdentidadAdministrado } from '../dominio/identidad-administrado';
import type { ServicioIdentificacion } from '../dominio/puertos/servicio-identificacion';
import { ErrorIdentidadNoCoincide, ErrorIdentificacionNoDisponible } from './errores';
import { datosParaServicio, leerIdentidad } from './identidad-comun';

/**
 * Identidad en mesa de partes (CU04 presencial de la 004, research §R-06): el personal tiene al
 * titular delante, así que se comprueba con el servicio de identificación pero sin enviar código.
 * Lanza `ErrorDatosInvalidos` (formato), `ErrorIdentidadNoCoincide` (sin decir qué dato) o
 * `ErrorIdentificacionNoDisponible`.
 */
export class VerificarIdentidadPresencial {
  constructor(private readonly servicio: ServicioIdentificacion) {}

  async ejecutar(datos: DatosIdentidadAdministrado): Promise<void> {
    const identidad = leerIdentidad(datos);
    const resultado = await this.servicio.verificar(datosParaServicio(identidad));
    if (resultado === 'NO_DISPONIBLE') {
      throw new ErrorIdentificacionNoDisponible();
    }
    if (resultado === 'NO_COINCIDE') {
      throw new ErrorIdentidadNoCoincide();
    }
  }
}
