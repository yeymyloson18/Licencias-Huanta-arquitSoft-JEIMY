import { type Fecha, fechaLima } from '../../../compartido/dominio/fecha-lima';
import type {
  AlertaGuardada,
  ExpedientesConPlazo,
  Reloj,
  RepositorioAlertas,
} from '../dominio/puertos';
import type { CalcularPlazos } from './feriados';

/** Con 2 días hábiles o menos (incluidos los vencidos) se alerta a la jefatura (FR-028). */
export const UMBRAL_DIAS_ALERTA = 2;

/** La alerta no existe (404). */
export class ErrorAlertaNoEncontrada extends Error {
  constructor() {
    super('La alerta no existe');
    this.name = 'ErrorAlertaNoEncontrada';
  }
}

/** La alerta ya se atendió (409). */
export class ErrorAlertaYaAtendida extends Error {
  constructor() {
    super('La alerta ya fue atendida');
    this.name = 'ErrorAlertaYaAtendida';
  }
}

/**
 * Genera las alertas de plazo (FR-028 y FR-029, research §R-07): completa los vencimientos que faltan
 * y alerta a los expedientes con plazo corriendo a los que les quedan 2 días hábiles o menos. Un
 * UNIQUE por expediente y vencimiento impide duplicarlas aunque corra varias veces.
 */
export class GenerarAlertas {
  constructor(
    private readonly d: {
      readonly alertas: Pick<RepositorioAlertas, 'insertarSiNoExiste'>;
      readonly expedientes: Pick<ExpedientesConPlazo, 'completarVencimientos' | 'conPlazo'>;
      readonly plazos: Pick<CalcularPlazos, 'diasHabilesRestantes'>;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(): Promise<number> {
    await this.d.expedientes.completarVencimientos();
    const en = this.d.reloj.ahora();
    const hoy = fechaLima(en);
    let nuevas = 0;
    for (const expediente of await this.d.expedientes.conPlazo()) {
      const dias = await this.d.plazos.diasHabilesRestantes(hoy, expediente.vencePlazoEn);
      if (
        dias <= UMBRAL_DIAS_ALERTA &&
        (await this.d.alertas.insertarSiNoExiste(
          expediente.numero,
          expediente.vencePlazoEn,
          dias,
          en,
        ))
      ) {
        nuevas += 1;
      }
    }
    return nuevas;
  }
}

/** Alerta para la pantalla de la jefatura (esquema `AlertaPlazo`). */
export interface AlertaParaJefatura extends AlertaGuardada {
  readonly estadoExpediente: string | null;
}

/** Alertas de la jefatura: de la más urgente a la menos urgente, y marcarlas como atendidas (FR-030). */
export class ConsultarAlertas {
  constructor(
    private readonly d: {
      readonly alertas: Pick<RepositorioAlertas, 'listar' | 'atender' | 'obtener'>;
      readonly expedientes: Pick<ExpedientesConPlazo, 'estadosDe'>;
      readonly plazos: Pick<CalcularPlazos, 'diasHabilesRestantes'>;
      readonly reloj: Reloj;
    },
  ) {}

  async listar(soloPendientes: boolean): Promise<AlertaParaJefatura[]> {
    const hoy = fechaLima(this.d.reloj.ahora());
    const alertas = await this.d.alertas.listar(soloPendientes);
    const estados = await this.d.expedientes.estadosDe(alertas.map((a) => a.numeroExpediente));
    const conDias = await Promise.all(
      alertas.map((alerta) => this.conEstado(alerta, hoy, estados)),
    );
    return conDias.sort(
      (a, b) =>
        a.diasHabilesRestantes - b.diasHabilesRestantes || a.venceEn.localeCompare(b.venceEn),
    );
  }

  async atender(id: number, usuarioId: string): Promise<AlertaParaJefatura> {
    const resultado = await this.d.alertas.atender(id, usuarioId, this.d.reloj.ahora());
    if (resultado === 'NO_EXISTE') {
      throw new ErrorAlertaNoEncontrada();
    }
    if (resultado === 'YA_ATENDIDA') {
      throw new ErrorAlertaYaAtendida();
    }
    const alerta = await this.d.alertas.obtener(id);
    if (alerta === null) {
      throw new ErrorAlertaNoEncontrada();
    }
    const estados = await this.d.expedientes.estadosDe([alerta.numeroExpediente]);
    return this.conEstado(alerta, fechaLima(this.d.reloj.ahora()), estados);
  }

  /** Los días restantes se recalculan al leer (el valor guardado es el de la generación). */
  private async conEstado(
    alerta: AlertaGuardada,
    hoy: Fecha,
    estados: ReadonlyMap<string, string>,
  ): Promise<AlertaParaJefatura> {
    return {
      ...alerta,
      diasHabilesRestantes: await this.d.plazos.diasHabilesRestantes(hoy, alerta.venceEn),
      estadoExpediente: estados.get(alerta.numeroExpediente) ?? null,
    };
  }
}
