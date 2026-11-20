import type {
  Decision,
  EventoParaPublicar,
  ExpedienteParaDecidir,
  RepositorioDecisiones,
} from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-decisiones';

/** Repositorio de decisiones en memoria para las pruebas de la 006 (transiciones del sistema). */
export class DecisionesEnMemoria implements RepositorioDecisiones {
  expediente: ExpedienteParaDecidir | null;
  readonly aplicadas: Decision[] = [];
  readonly publicados: EventoParaPublicar[] = [];
  /** Cuántas veces responder "otro cambio ganó" antes de aceptar. */
  rechazar = 0;

  constructor(inicial: Partial<ExpedienteParaDecidir> = {}) {
    this.expediente = {
      id: 'id-1',
      numero: 'EXP-2026-000001',
      estado: 'APROBADO',
      ruta: 'A',
      codigoReceta: 'LIC-02',
      version: 5,
      yaObservado: false,
      ...inicial,
    };
  }

  obtenerParaDecidir() {
    return Promise.resolve(this.expediente);
  }

  aplicar(decision: Decision) {
    if (this.rechazar > 0) {
      this.rechazar -= 1;
      return Promise.resolve(false);
    }
    this.aplicadas.push(decision);
    if (this.expediente) {
      this.expediente = {
        ...this.expediente,
        estado: decision.estadoNuevo,
        version: this.expediente.version + 1,
      };
    }
    return Promise.resolve(true);
  }

  publicar(eventos: readonly EventoParaPublicar[]) {
    this.publicados.push(...eventos);
    return Promise.resolve();
  }

  /** Tipos de los eventos de la última decisión. */
  eventos(): string[] {
    return (this.aplicadas.at(-1)?.eventos ?? []).map((evento) => evento.tipo);
  }
}
