import type { Fecha } from '../../../compartido/dominio/fecha-lima';
import { codigoDesdeBytes, LARGO_BYTES_CODIGO } from '../dominio/codigo-verificacion';
import { Licencia, type TipoLicencia } from '../dominio/licencia';
import type {
  ExpedientesParaLicencia,
  GeneradorAleatorio,
  Reloj,
  RepositorioLicencias,
} from '../dominio/puertos';
import { ErrorExpedienteSinDatos } from './errores';

/**
 * Emite la licencia al consumir `LicenciaSolicitada` (FR-001, FR-003 y FR-004 de la 006). Una sola
 * vigente por expediente: si ya existe, vuelve a publicar `LicenciaEmitida` para que Trámites avance
 * (la entrega de eventos es "al menos una vez").
 */
export class EmitirLicencia {
  constructor(
    private readonly d: {
      readonly licencias: RepositorioLicencias;
      readonly expedientes: ExpedientesParaLicencia;
      readonly aleatorio: GeneradorAleatorio;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(entrada: {
    readonly numeroExpediente: string;
    readonly tipo: TipoLicencia;
    readonly certificado: { readonly numero: string; readonly emitidoEn: Fecha } | null;
  }): Promise<Licencia> {
    const existente = await this.d.licencias.vigenteDe(entrada.numeroExpediente);
    if (existente !== null) {
      await this.d.licencias.publicarEmitida(existente);
      return existente;
    }
    const expediente = await this.d.expedientes.datosParaLicencia(entrada.numeroExpediente);
    if (expediente === null) {
      throw new ErrorExpedienteSinDatos();
    }
    const en = this.d.reloj.ahora();
    const codigo = codigoDesdeBytes(this.d.aleatorio.bytes(LARGO_BYTES_CODIGO));
    const resultado = await this.d.licencias.emitir((correlativo) =>
      Licencia.emitir({
        correlativo,
        codigoVerificacion: codigo,
        tipo: entrada.tipo,
        expediente,
        certificado: entrada.certificado,
        en,
      }),
    );
    if (resultado.tipo === 'YA_EXISTIA') {
      await this.d.licencias.publicarEmitida(resultado.licencia);
    }
    return resultado.licencia;
  }
}
