import {
  armarPanel,
  limitesIngresosFallidos,
  type PanelAdministrador,
} from '../dominio/panel-administrador';
import type { BloqueosCuentas } from '../dominio/puertos/bloqueos-cuentas';
import type { ConsultaPanel } from '../dominio/puertos/consulta-panel';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';

export interface DependenciasObtenerPanel {
  readonly consulta: ConsultaPanel;
  readonly bloqueos: BloqueosCuentas;
  readonly auditoria: RepositorioAuditoria;
  readonly reloj: Reloj;
}

const ULTIMOS_EVENTOS = 10;
/** Los últimos eventos se buscan desde el inicio de la auditoría (no hay eventos antes). */
const DESDE_SIEMPRE = new Date(0);

/**
 * Panel del administrador (HU1 de la 009): usuarios, roles, bloqueos, sesiones, ingresos fallidos y
 * los últimos 10 eventos. Si el servicio de bloqueos no responde, esa cifra queda en `null` y el
 * resto se muestra igual (FR-004).
 */
export class ObtenerPanel {
  constructor(private readonly d: DependenciasObtenerPanel) {}

  async ejecutar(): Promise<PanelAdministrador> {
    const ahora = this.d.reloj.ahora();
    const limites = limitesIngresosFallidos(ahora);
    const [cifras, bloqueos, fallidosHoy, fallidos7Dias, ultimos] = await Promise.all([
      this.d.consulta.cifrasUsuarios(ahora),
      this.d.bloqueos.bloqueosActuales(),
      this.d.auditoria.contarIngresosFallidos(limites.hoy),
      this.d.auditoria.contarIngresosFallidos(limites.ultimos7Dias),
      this.d.auditoria.buscar(
        { desde: DESDE_SIEMPRE, hasta: new Date(ahora.getTime() + 60_000) },
        0,
        ULTIMOS_EVENTOS,
      ),
    ]);
    // Solo cuentan las cuentas que existen: un correo inventado bloqueado no es una cuenta.
    const resumen =
      bloqueos === null
        ? null
        : {
            cuentas: await this.d.consulta.contarCuentasExistentes(bloqueos.correosHmac),
            origenes: bloqueos.origenes,
          };
    return armarPanel({
      cifras,
      bloqueos: resumen,
      fallidosHoy,
      fallidos7Dias,
      ultimosEventos: ultimos.filas,
    });
  }
}
