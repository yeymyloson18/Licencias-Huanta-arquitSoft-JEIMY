import type { FachadaLicencias } from '../../licencias/fachada';
import type { FachadaPagos } from '../../pagos/fachada';
import type { FachadaSeguridad } from '../../seguridad/fachada';
import type {
  DatosPagoConsulta,
  EsquelaParaConsulta,
} from '../dominio/puertos/datos-pago-consulta';

/** Adaptador de `DatosPagoConsulta` sobre las fachadas de Pagos, Seguridad y Licencias (principio I). */
export class DatosPagoConsultaFachadas implements DatosPagoConsulta {
  constructor(
    private readonly pagos: FachadaPagos,
    private readonly seguridad: FachadaSeguridad,
    private readonly licencias: FachadaLicencias,
  ) {}

  numeroLicenciaDe(numeroExpediente: string): Promise<string | null> {
    return this.licencias.numeroDeLicencia(numeroExpediente);
  }

  esquelaDe(numeroExpediente: string): Promise<EsquelaParaConsulta | null> {
    return this.pagos.esquelaDelExpediente(numeroExpediente);
  }

  tokenConsulta(numeroExpediente: string) {
    return this.seguridad.emitirTokenConsulta(numeroExpediente);
  }
}
