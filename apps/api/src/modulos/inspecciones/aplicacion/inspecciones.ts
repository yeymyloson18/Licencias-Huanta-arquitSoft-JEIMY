import type { AlmacenArchivos } from '../../../compartido/dominio/almacen-archivos';
import { type Fecha, fechaLima } from '../../../compartido/dominio/fecha-lima';
import { detectarTipoArchivo, TAMANO_MAXIMO_BYTES } from '../../../compartido/dominio/tipo-archivo';
import {
  type DatosInspeccion,
  ErrorDatoInspeccion,
  ErrorInspeccionYaRegistrada,
  ErrorNoEsInspectorAsignado,
  type EstadoInspeccion,
  type ResultadoItse,
  type TipoInspeccion,
} from '../dominio/inspeccion';
import type {
  ExpedientesInspecciones,
  FotoGuardada,
  GeneradorIds,
  PersonalInspecciones,
  Reloj,
  RepositorioInspecciones,
} from '../dominio/puertos';

/** La inspección no existe (404). */
export class ErrorInspeccionNoEncontrada extends Error {
  constructor() {
    super('La inspección no existe');
    this.name = 'ErrorInspeccionNoEncontrada';
  }
}

/** Crea la inspección al consumir `InspeccionRequerida` (idempotente: una por expediente y tipo). */
export class CrearInspeccion {
  constructor(private readonly inspecciones: Pick<RepositorioInspecciones, 'crearSiNoExiste'>) {}

  ejecutar(evento: { readonly numeroExpediente: string; readonly tipo: TipoInspeccion }) {
    return this.inspecciones.crearSiNoExiste(evento.numeroExpediente, evento.tipo);
  }
}

/** La jefatura asigna (o reasigna) el inspector y la fecha (FR-008). */
export class AsignarInspector {
  constructor(
    private readonly d: {
      readonly inspecciones: Pick<RepositorioInspecciones, 'obtener' | 'asignar'>;
      readonly personal: Pick<PersonalInspecciones, 'inspectoresActivos'>;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(entrada: {
    readonly inspeccionId: string;
    readonly inspectorId: string;
    readonly programadaPara: Fecha;
    readonly usuarioId: string;
  }): Promise<DatosInspeccion> {
    const inspeccion = await this.d.inspecciones.obtener(entrada.inspeccionId);
    if (inspeccion === null) {
      throw new ErrorInspeccionNoEncontrada();
    }
    const inspectores = await this.d.personal.inspectoresActivos();
    if (!inspectores.some((inspector) => inspector.id === entrada.inspectorId)) {
      throw new ErrorDatoInspeccion('inspectorId', 'Elige un inspector activo');
    }
    const en = this.d.reloj.ahora();
    const asignada = inspeccion.asignar(entrada.inspectorId, entrada.programadaPara, fechaLima(en));
    if (!(await this.d.inspecciones.asignar(asignada, entrada.usuarioId, en))) {
      // El resultado se registró entre la lectura y el guardado.
      throw new ErrorInspeccionYaRegistrada();
    }
    return asignada.aDatos();
  }
}

export interface FotoRecibida {
  readonly contenido: Uint8Array;
}

/**
 * El inspector asignado registra el resultado con fotos (FR-010 a FR-013). Las fotos se comprueban
 * por su contenido y se guardan antes de la transacción; si la transacción no se hace, se borran.
 */
export class RegistrarResultado {
  constructor(
    private readonly d: {
      readonly inspecciones: Pick<RepositorioInspecciones, 'obtener' | 'registrarResultado'>;
      readonly almacen: AlmacenArchivos;
      readonly ids: GeneradorIds;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(entrada: {
    readonly inspeccionId: string;
    readonly inspectorId: string;
    readonly resultado: ResultadoItse;
    readonly observaciones: string | null;
    readonly numeroCertificado: string | null;
    readonly certificadoEmitidoEn: Fecha | null;
    readonly fotos: readonly FotoRecibida[];
  }): Promise<DatosInspeccion> {
    const inspeccion = await this.d.inspecciones.obtener(entrada.inspeccionId);
    if (inspeccion === null) {
      throw new ErrorInspeccionNoEncontrada();
    }
    const en = this.d.reloj.ahora();
    const registrada = inspeccion.registrarResultado({
      ...entrada,
      cantidadFotos: entrada.fotos.length,
      hoy: fechaLima(en),
      en,
    });
    const fotos = entrada.fotos.map((foto, indice): FotoGuardada & { contenido: Uint8Array } => {
      const tipo = detectarTipoArchivo(foto.contenido);
      if (tipo !== 'image/jpeg' && tipo !== 'image/png') {
        throw new ErrorDatoInspeccion(
          `fotos.${String(indice)}`,
          'Cada foto debe ser una imagen JPG o PNG',
        );
      }
      if (foto.contenido.length === 0 || foto.contenido.length > TAMANO_MAXIMO_BYTES) {
        throw new ErrorDatoInspeccion(
          `fotos.${String(indice)}`,
          'Cada foto puede pesar hasta 10 MB',
        );
      }
      return {
        clave: this.d.ids.nuevoId(),
        tipoMime: tipo,
        tamanoBytes: foto.contenido.length,
        contenido: foto.contenido,
      };
    });

    const guardadas: string[] = [];
    try {
      for (const foto of fotos) {
        await this.d.almacen.guardar(foto.clave, foto.contenido);
        guardadas.push(foto.clave);
      }
      const hecho = await this.d.inspecciones.registrarResultado(
        registrada,
        fotos.map(({ clave, tipoMime, tamanoBytes }) => ({ clave, tipoMime, tamanoBytes })),
        en,
      );
      if (!hecho) {
        throw await this.porQueNo(entrada.inspeccionId);
      }
    } catch (error) {
      await Promise.all(
        guardadas.map((clave) => this.d.almacen.borrar(clave).catch(() => undefined)),
      );
      throw error;
    }
    return registrada.aDatos();
  }

  /** Otro registro (o una reasignación) ganó la carrera: se explica por qué. */
  private async porQueNo(inspeccionId: string): Promise<Error> {
    const actual = await this.d.inspecciones.obtener(inspeccionId);
    return actual?.aDatos().estado === 'REALIZADA'
      ? new ErrorInspeccionYaRegistrada()
      : new ErrorNoEsInspectorAsignado();
  }
}

/** Fila de la bandeja (esquema `Inspeccion`); la dirección solo para el inspector asignado. */
export interface InspeccionParaBandeja extends DatosInspeccion {
  readonly giro: string;
  readonly nombreLicencia: string;
  readonly nombreInspector: string | null;
  readonly direccion?: string;
}

/** Bandeja de inspecciones: la jefatura ve todas; el inspector, solo las suyas (FR-008, FR-009). */
export class ListarInspecciones {
  constructor(
    private readonly d: {
      readonly inspecciones: Pick<RepositorioInspecciones, 'listar'>;
      readonly personal: Pick<PersonalInspecciones, 'nombresDe'>;
      readonly expedientes: ExpedientesInspecciones;
    },
  ) {}

  async ejecutar(entrada: {
    readonly usuario: { readonly id: string; readonly esJefatura: boolean };
    readonly estado: EstadoInspeccion | null;
    readonly pagina: number;
    readonly porPagina: number;
  }) {
    const comoInspector = !entrada.usuario.esJefatura;
    const pagina = await this.d.inspecciones.listar({
      inspectorId: comoInspector ? entrada.usuario.id : null,
      estado: entrada.estado,
      pagina: entrada.pagina,
      porPagina: entrada.porPagina,
    });
    const datos = pagina.datos.map((inspeccion) => inspeccion.aDatos());
    const [resumenes, nombres] = await Promise.all([
      this.d.expedientes.resumenes(datos.map((dato) => dato.numeroExpediente)),
      this.d.personal.nombresDe(
        datos.flatMap((dato) => (dato.inspectorId === null ? [] : [dato.inspectorId])),
      ),
    ]);
    const filas: InspeccionParaBandeja[] = [];
    for (const dato of datos) {
      const resumen = resumenes.get(dato.numeroExpediente);
      const direccion = comoInspector
        ? await this.d.expedientes.direccionDelLocal(dato.numeroExpediente)
        : null;
      filas.push({
        ...dato,
        giro: resumen?.giro ?? '',
        nombreLicencia: resumen?.nombreLicencia ?? '',
        nombreInspector: dato.inspectorId === null ? null : (nombres.get(dato.inspectorId) ?? null),
        ...(direccion === null ? {} : { direccion }),
      });
    }
    return {
      pagina: entrada.pagina,
      porPagina: entrada.porPagina,
      total: pagina.total,
      datos: filas,
    };
  }
}
