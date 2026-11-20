import { enmascararDocumento } from '../dominio/enmascarar-documento';
import { ErrorValidacionSolicitud } from '../dominio/errores';
import type { EstadoExpediente } from '../dominio/estado-publico';
import { NumeroExpediente } from '../dominio/numero-expediente';
import type { AlmacenArchivos } from '../../../compartido/dominio/almacen-archivos';
import type { Reloj } from '../dominio/puertos/reloj';
import type {
  ExpedienteDetalle,
  PaginaExpedientes,
  RepositorioExpedientes,
} from '../dominio/puertos/repositorio-expedientes';
import { ErrorExpedienteNoEncontrado } from './errores';

// Bandeja del personal (historia 4 de la 004, contracts/consulta-y-bandeja.md): MESA_PARTES,
// EVALUADOR y JEFATURA ven todos los expedientes (aclaración 5). El control de roles es de la
// presentación; aquí, los filtros, la auditoría del detalle y la descarga.

export const POR_PAGINA_MAXIMO = 50;

/** `GET /expedientes`: filtros combinados, del más reciente al más antiguo, hasta 50 por página. */
export class ListarExpedientes {
  constructor(private readonly expedientes: Pick<RepositorioExpedientes, 'listar'>) {}

  async ejecutar(filtro: {
    readonly estado: EstadoExpediente | null;
    readonly ruta: 'A' | 'B' | 'C' | null;
    readonly pagina: number;
    readonly porPagina: number;
  }): Promise<PaginaExpedientes & { readonly pagina: number; readonly porPagina: number }> {
    const errores = [];
    if (!Number.isInteger(filtro.pagina) || filtro.pagina < 1) {
      errores.push({ campo: 'pagina', mensaje: 'Debe ser un número entero mayor que 0' });
    }
    if (
      !Number.isInteger(filtro.porPagina) ||
      filtro.porPagina < 1 ||
      filtro.porPagina > POR_PAGINA_MAXIMO
    ) {
      errores.push({
        campo: 'porPagina',
        mensaje: `Debe estar entre 1 y ${String(POR_PAGINA_MAXIMO)}`,
      });
    }
    if (errores.length > 0) {
      throw new ErrorValidacionSolicitud(errores);
    }
    const pagina = await this.expedientes.listar(filtro);
    return { ...pagina, pagina: filtro.pagina, porPagina: filtro.porPagina };
  }
}

export type DetalleParaPersonal = Omit<ExpedienteDetalle, 'documentoTitular'> & {
  readonly documentoTitularEnmascarado: string;
};

/** `GET /expedientes/{numero}`: el detalle con el documento enmascarado y la auditoría VER_DETALLE. */
export class ObtenerDetalleExpediente {
  constructor(
    private readonly dependencias: {
      readonly expedientes: Pick<RepositorioExpedientes, 'obtenerDetalle'>;
      readonly reloj: Reloj;
    },
  ) {}

  /**
   * Con `registrarVista: false` (la respuesta de una decisión del evaluador, 005) no se registra
   * `VER_DETALLE`: la decisión ya deja su propia auditoría.
   */
  async ejecutar(entrada: {
    readonly numero: string;
    readonly usuarioId: string;
    readonly registrarVista?: boolean;
  }): Promise<DetalleParaPersonal> {
    const numero = leerNumero(entrada.numero);
    const lector =
      entrada.registrarVista === false
        ? null
        : { usuarioId: entrada.usuarioId, en: this.dependencias.reloj.ahora() };
    const detalle = await this.dependencias.expedientes.obtenerDetalle(numero, lector);
    if (detalle === null) {
      throw new ErrorExpedienteNoEncontrado();
    }
    const { documentoTitular, ...resto } = detalle;
    return { ...resto, documentoTitularEnmascarado: enmascararDocumento(documentoTitular) };
  }
}

export interface ArchivoDescargado {
  readonly nombreOriginal: string;
  readonly tipoMime: string;
  readonly contenido: Uint8Array;
}

/** `GET /expedientes/{numero}/documentos/{id}`: solo documentos de ESE expediente. */
export class DescargarDocumento {
  constructor(
    private readonly dependencias: {
      readonly expedientes: Pick<RepositorioExpedientes, 'buscarDocumento'>;
      readonly almacen: AlmacenArchivos;
    },
  ) {}

  async ejecutar(entrada: {
    readonly numero: string;
    readonly documentoId: string;
  }): Promise<ArchivoDescargado> {
    const numero = leerNumero(entrada.numero);
    const documento = await this.dependencias.expedientes.buscarDocumento(
      numero,
      entrada.documentoId,
    );
    if (documento === null) {
      throw new ErrorExpedienteNoEncontrado();
    }
    return {
      nombreOriginal: documento.nombreOriginal,
      tipoMime: documento.tipoMime,
      contenido: await this.dependencias.almacen.leer(documento.claveAlmacen),
    };
  }
}

/** Un número con formato inválido no puede existir: se responde como no encontrado. */
const leerNumero = (texto: string): NumeroExpediente => {
  try {
    return NumeroExpediente.normalizar(texto);
  } catch {
    throw new ErrorExpedienteNoEncontrado();
  }
};
