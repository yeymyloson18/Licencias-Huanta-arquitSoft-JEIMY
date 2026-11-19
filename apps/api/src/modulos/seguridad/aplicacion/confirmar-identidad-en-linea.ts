import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { DatosIdentidadAdministrado } from '../dominio/identidad-administrado';
import type { RepositorioVerificaciones } from '../dominio/puertos/repositorio-verificaciones';
import { mismaHuella } from '../dominio/verificacion-identidad';
import { ErrorIdentidadNoConfirmada } from './errores';
import { calcularHuellas, leerIdentidad } from './identidad-comun';

/**
 * Comprueba que la identidad que llega con la solicitud es la que se confirmó con el código
 * (research §R-05 de la 004): compara las huellas de documento, RUC, celular y representante. Así
 * Seguridad no guarda una copia de los datos personales para entregarlos después.
 */
export class ConfirmarIdentidadEnLinea {
  constructor(
    private readonly verificaciones: RepositorioVerificaciones,
    private readonly protector: ProtectorDatos,
  ) {}

  async ejecutar(verificacionId: string, datos: DatosIdentidadAdministrado): Promise<void> {
    const identidad = leerIdentidad(datos);
    const verificacion = await this.verificaciones.obtenerPorId(verificacionId);
    if (verificacion === null || verificacion.confirmadaEn === null) {
      throw new ErrorIdentidadNoConfirmada();
    }
    const enviada = calcularHuellas(identidad, this.protector);
    const confirmada = verificacion.huellas;
    const coincide =
      enviada.tipoDocumento === confirmada.tipoDocumento &&
      mismaHuella(enviada.documentoHmac, confirmada.documentoHmac) &&
      mismaHuella(enviada.rucHmac, confirmada.rucHmac) &&
      mismaHuella(enviada.celularHmac, confirmada.celularHmac) &&
      mismaHuella(enviada.representanteHmac, confirmada.representanteHmac);
    if (!coincide) {
      throw new ErrorIdentidadNoConfirmada();
    }
  }
}
