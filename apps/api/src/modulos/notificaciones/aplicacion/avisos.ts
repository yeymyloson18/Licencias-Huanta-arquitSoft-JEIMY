import { elegirCanal, siguienteIntento, textoDelAviso, type DatosAviso } from '../dominio/aviso';
import type {
  EnviadorMensajes,
  ExpedientesAvisos,
  Reloj,
  RepositorioAvisos,
} from '../dominio/puertos';

/** El expediente no existe o no tiene contacto: el evento se reintenta. */
export class ErrorSinContacto extends Error {
  constructor() {
    super('El expediente no tiene contacto para el aviso');
    this.name = 'ErrorSinContacto';
  }
}

/**
 * Crea el aviso de un evento (FR-031, FR-032, FR-034): un aviso por evento (idempotente), por correo
 * si el titular lo dio o si no por SMS; el destinatario se guarda cifrado (lo hace el repositorio).
 */
export class CrearAviso {
  constructor(
    private readonly d: {
      readonly avisos: Pick<RepositorioAvisos, 'crearSiNoExiste'>;
      readonly expedientes: ExpedientesAvisos;
      readonly reloj: Reloj;
    },
  ) {}

  async cambioDeEstado(evento: {
    readonly eventoId: bigint;
    readonly numeroExpediente: string;
    readonly estadoNuevo: string;
  }): Promise<boolean> {
    const texto = this.d.expedientes.textoDeEstado(evento.estadoNuevo);
    if (texto === null) {
      return false;
    }
    return this.crear(evento.eventoId, evento.numeroExpediente, {
      plantilla: 'CAMBIO_ESTADO',
      numeroExpediente: evento.numeroExpediente,
      estado: evento.estadoNuevo,
      descripcion: texto.descripcion,
      siguientePaso: texto.siguientePaso,
    });
  }

  itsePorVencer(evento: {
    readonly eventoId: bigint;
    readonly numeroExpediente: string;
    readonly venceEn: string;
  }): Promise<boolean> {
    return this.crear(evento.eventoId, evento.numeroExpediente, {
      plantilla: 'ITSE_POR_VENCER',
      numeroExpediente: evento.numeroExpediente,
      venceEn: evento.venceEn,
    });
  }

  private async crear(eventoId: bigint, numero: string, datos: DatosAviso): Promise<boolean> {
    const contacto = await this.d.expedientes.contactoTitular(numero);
    if (contacto === null) {
      throw new ErrorSinContacto();
    }
    const { canal, destino } = elegirCanal(contacto);
    return this.d.avisos.crearSiNoExiste({
      eventoId,
      canal,
      destino,
      datos,
      en: this.d.reloj.ahora(),
    });
  }
}

/** Avisos que se intentan enviar por pasada. */
const LOTE = 20;

/** Envía los avisos pendientes; reintenta con espera creciente hasta 5 intentos (FR-033). */
export class EnviarAvisosPendientes {
  constructor(
    private readonly d: {
      readonly avisos: Omit<RepositorioAvisos, 'crearSiNoExiste'>;
      readonly enviador: EnviadorMensajes;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(): Promise<{ readonly enviados: number; readonly fallidos: number }> {
    let enviados = 0;
    let fallidos = 0;
    for (const aviso of await this.d.avisos.tomarPendientes(LOTE, this.d.reloj.ahora())) {
      try {
        await this.d.enviador.enviar({
          id: aviso.id,
          canal: aviso.canal,
          destino: aviso.destino,
          texto: textoDelAviso(aviso.datos),
        });
        await this.d.avisos.marcarEnviado(aviso.id, this.d.reloj.ahora());
        enviados += 1;
      } catch (error) {
        const intentos = aviso.intentos + 1;
        await this.d.avisos.marcarFallo(
          aviso.id,
          intentos,
          error instanceof Error ? error.name : 'Error',
          siguienteIntento(intentos, this.d.reloj.ahora()),
        );
        fallidos += 1;
      }
    }
    return { enviados, fallidos };
  }
}
