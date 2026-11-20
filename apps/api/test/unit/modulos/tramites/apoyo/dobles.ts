// Dobles en memoria de los puertos del módulo Trámites (004).
import type { Expediente } from '../../../../../src/modulos/tramites/dominio/expediente';
import { NumeroExpediente } from '../../../../../src/modulos/tramites/dominio/numero-expediente';
import type { AlmacenArchivos } from '../../../../../src/modulos/tramites/dominio/puertos/almacen-archivos';
import type { CalculadorHuella } from '../../../../../src/modulos/tramites/dominio/puertos/calculador-huella';
import type { CatalogoRecetas } from '../../../../../src/modulos/tramites/dominio/puertos/catalogo-recetas';
import type { GeneradorIds } from '../../../../../src/modulos/tramites/dominio/puertos/generador-ids';
import type {
  DocumentoTemporal,
  RepositorioDocumentosTemporales,
} from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-documentos-temporales';
import type { Reloj } from '../../../../../src/modulos/tramites/dominio/puertos/reloj';
import type {
  PresentacionExistente,
  ResultadoRegistro,
  UnidadDeTrabajoTramites,
} from '../../../../../src/modulos/tramites/dominio/puertos/unidad-de-trabajo-tramites';
import type {
  ResultadoIdentidad,
  ResultadoIdentidadPresencial,
  VerificadorIdentidad,
} from '../../../../../src/modulos/tramites/dominio/puertos/verificador-identidad';
import type { RecetaAlPresentar } from '../../../../../src/modulos/tramites/dominio/receta-al-presentar';

export const T0 = new Date('2026-11-19T15:00:00.000Z');

export class RelojFalso implements Reloj {
  constructor(private actual: Date = T0) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  avanzar(segundos: number): void {
    this.actual = new Date(this.actual.getTime() + segundos * 1000);
  }
}

export class IdsFalsos implements GeneradorIds {
  private contador = 0;
  generarId(): string {
    this.contador += 1;
    return `id-${String(this.contador)}`;
  }
}

/** Huella `sha:<largo>:<primer byte>`: distingue contenidos sin criptografía real. */
export class HuellaFalsa implements CalculadorHuella {
  sha256(datos: Uint8Array): string {
    return `sha:${new TextDecoder().decode(datos)}`;
  }
}

export class AlmacenFalso implements AlmacenArchivos {
  readonly archivos = new Map<string, Uint8Array>();
  guardar(clave: string, contenido: Uint8Array): Promise<void> {
    this.archivos.set(clave, contenido);
    return Promise.resolve();
  }
  leer(clave: string): Promise<Uint8Array> {
    const contenido = this.archivos.get(clave);
    return contenido ? Promise.resolve(contenido) : Promise.reject(new Error('no existe'));
  }
  borrar(clave: string): Promise<void> {
    this.archivos.delete(clave);
    return Promise.resolve();
  }
}

export class DocumentosTemporalesEnMemoria implements RepositorioDocumentosTemporales {
  readonly documentos = new Map<string, DocumentoTemporal>();
  falla = false;
  crear(documento: DocumentoTemporal): Promise<void> {
    if (this.falla) {
      return Promise.reject(new Error('base caída'));
    }
    this.documentos.set(documento.id, documento);
    return Promise.resolve();
  }
  obtenerVarios(ids: readonly string[]): Promise<DocumentoTemporal[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const documento = this.documentos.get(id);
        return documento ? [documento] : [];
      }),
    );
  }
}

export const RECETA_LIC02: RecetaAlPresentar = {
  codigo: 'LIC-02',
  nombre: 'Licencia de funcionamiento – riesgo medio',
  ruta: 'A',
  tasa: '177.10',
  plazoDias: 2,
  tipoPlazo: 'HABILES',
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'POSTERIOR',
  plazoItseDias: 9,
  vigenciaMeses: null,
  requisitos: [
    { id: 11, orden: 1, descripcion: 'Solicitud', obligatorio: true, condicion: 'SIEMPRE' },
    {
      id: 12,
      orden: 2,
      descripcion: 'Carta poder',
      obligatorio: true,
      condicion: 'CON_REPRESENTANTE',
    },
    { id: 13, orden: 3, descripcion: 'Declaración', obligatorio: true, condicion: 'SIEMPRE' },
    { id: 14, orden: 4, descripcion: 'Especiales', obligatorio: true, condicion: 'GIRO_ESPECIAL' },
  ],
};

export class CatalogoFalso implements CatalogoRecetas {
  recetas = new Map<string, RecetaAlPresentar>([['LIC-02', RECETA_LIC02]]);
  obtenerRecetaVigente(codigo: string): Promise<RecetaAlPresentar | null> {
    return Promise.resolve(this.recetas.get(codigo) ?? null);
  }
}

export class VerificadorFalso implements VerificadorIdentidad {
  resultado: ResultadoIdentidad = { tipo: 'CONFIRMADA' };
  presencial: ResultadoIdentidadPresencial = { tipo: 'VALIDA' };
  confirmarEnLinea(): Promise<ResultadoIdentidad> {
    return Promise.resolve(this.resultado);
  }
  verificarPresencial(): Promise<ResultadoIdentidadPresencial> {
    return Promise.resolve(this.presencial);
  }
}

/** Unidad de trabajo en memoria: numera desde 1 y simula el permiso de un solo uso. */
export class UnidadDeTrabajoFalsa implements UnidadDeTrabajoTramites {
  readonly expedientes: Expediente[] = [];
  readonly claves = new Map<string, PresentacionExistente>();
  readonly documentosMovidos: string[] = [];
  /** Resultado forzado del próximo `registrar` (para simular carreras). */
  forzar: ResultadoRegistro | null = null;
  private correlativo = 0;

  buscarPorClave(clave: string): Promise<PresentacionExistente | null> {
    return Promise.resolve(this.claves.get(clave) ?? null);
  }

  registrar(solicitud: {
    armar: (numero: NumeroExpediente) => Expediente;
    anio: number;
    claveIdempotencia: string;
    huellaCuerpo: string;
  }): Promise<ResultadoRegistro> {
    if (this.forzar !== null) {
      const forzado = this.forzar;
      this.forzar = null;
      return Promise.resolve(forzado);
    }
    this.correlativo += 1;
    const expediente = solicitud.armar(NumeroExpediente.crear(solicitud.anio, this.correlativo));
    if (
      expediente.verificacionId !== null &&
      this.expedientes.some((otro) => otro.verificacionId === expediente.verificacionId)
    ) {
      return Promise.resolve({ tipo: 'PERMISO_USADO' });
    }
    this.expedientes.push(expediente);
    this.documentosMovidos.push(...expediente.documentos.map((doc) => doc.documentoId));
    const registrado = {
      numero: expediente.numero.valor,
      estado: expediente.estado,
      ruta: expediente.ruta,
      codigoReceta: expediente.receta.codigo,
      nombreLicencia: expediente.receta.nombre,
      canal: expediente.canal,
      presentadoEn: expediente.presentadoEn,
    };
    this.claves.set(solicitud.claveIdempotencia, {
      huellaCuerpo: solicitud.huellaCuerpo,
      registrado,
    });
    return Promise.resolve({ tipo: 'CREADO', registrado });
  }
}
