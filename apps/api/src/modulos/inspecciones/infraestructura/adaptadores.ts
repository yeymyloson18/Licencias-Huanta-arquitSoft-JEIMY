import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FachadaSeguridad } from '../../seguridad/fachada';
import type { FachadaTramites } from '../../tramites/fachada';
import type { CrearInspeccion } from '../aplicacion/inspecciones';
import type {
  ExpedientesInspecciones,
  GeneradorIds,
  PersonalInspecciones,
  Reloj,
} from '../dominio/puertos';

export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}

export class GeneradorIdsCrypto implements GeneradorIds {
  nuevoId(): string {
    return randomUUID();
  }
}

/** Adaptador de `PersonalInspecciones` sobre la fachada de Seguridad (principio I). */
export class PersonalFachadaSeguridad implements PersonalInspecciones {
  constructor(private readonly seguridad: FachadaSeguridad) {}

  inspectoresActivos() {
    return this.seguridad.usuariosConRol('INSPECTOR');
  }

  nombresDe(ids: readonly string[]) {
    return this.seguridad.nombresDeUsuarios(ids);
  }
}

/** Adaptador de `ExpedientesInspecciones` sobre la fachada de Trámites (principio I). */
export class ExpedientesFachadaTramites implements ExpedientesInspecciones {
  constructor(private readonly tramites: FachadaTramites) {}

  resumenes(numeros: readonly string[]) {
    return this.tramites.resumenesParaInspeccion(numeros);
  }

  direccionDelLocal(numero: string) {
    return this.tramites.direccionDelLocal(numero);
  }
}

/** El evento no tiene la forma esperada; el despachador lo reintenta y avisa cada 10 fallos. */
export class ErrorEventoInvalidoInspecciones extends Error {
  constructor() {
    super('Evento InspeccionRequerida inválido');
    this.name = 'ErrorEventoInvalidoInspecciones';
  }
}

const esquemaInspeccionRequerida = z.object({
  numeroExpediente: z.string().regex(/^EXP-[0-9]{4}-[0-9]{6}$/),
  tipo: z.enum(['PREVIA', 'POSTERIOR', 'BODEGA']),
});

/** `InspeccionRequerida` → crea la inspección pendiente (research §R-01 de la 006). */
export const manejadorInspeccionRequerida =
  (crear: CrearInspeccion) =>
  async (datos: unknown): Promise<void> => {
    const evento = esquemaInspeccionRequerida.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoInspecciones();
    }
    await crear.ejecutar(evento.data);
  };
