import { ErrorValidacionSolicitud, type ErrorCampoSolicitud } from './errores';
import type { NumeroExpediente } from './numero-expediente';
import type { RecetaAlPresentar } from './receta-al-presentar';

// Expediente: la solicitud presentada (FR-016 a FR-024 de la 004, data-model.md §2). Solo se crea en
// REGISTRADO, con la ruta de la receta y su primer registro del historial. Las demás transiciones son
// de la 005 a la 009. Los datos personales viajan en claro dentro del proceso y la infraestructura
// los cifra al guardarlos (FR-034).

export type Canal = 'EN_LINEA' | 'MESA_PARTES';

export interface TitularSolicitud {
  readonly tipoDocumento: 'DNI' | 'CE';
  readonly numeroDocumento: string;
  readonly ruc: string;
  readonly celular: string;
  readonly correo: string | null;
  readonly nombre: string;
  readonly razonSocial: string | null;
}

export interface RepresentanteSolicitud {
  readonly tipoDocumento: 'DNI' | 'CE';
  readonly numeroDocumento: string;
}

export interface Establecimiento {
  readonly nombreComercial: string | null;
  readonly giro: string;
  readonly direccion: string;
  readonly zona: string;
  /** m², con 2 decimales como máximo. */
  readonly areaM2: number | null;
}

export interface RegistroHistorial {
  readonly estadoAnterior: string | null;
  readonly estadoNuevo: 'REGISTRADO';
  readonly usuarioId: string | null;
  readonly comentario: string;
  readonly ocurridoEn: Date;
}

export interface DocumentoDelExpediente {
  readonly documentoId: string;
  readonly requisitoId: number;
  readonly requisitoOrden: number;
}

export interface Expediente {
  readonly numero: NumeroExpediente;
  readonly receta: RecetaAlPresentar;
  readonly ruta: 'A' | 'B' | 'C';
  readonly estado: 'REGISTRADO';
  readonly canal: Canal;
  readonly titular: TitularSolicitud;
  readonly representante: RepresentanteSolicitud | null;
  readonly establecimiento: Establecimiento;
  readonly documentos: readonly DocumentoDelExpediente[];
  readonly presentadoEn: Date;
  /** En mesa de partes, quién lo registró; en línea, `null`. */
  readonly registradoPor: string | null;
  /** En línea, la verificación de identidad usada (una sola vez); en mesa de partes, `null`. */
  readonly verificacionId: string | null;
  readonly historial: readonly RegistroHistorial[];
  /** Vacío hasta la funcionalidad 008 (FR-022). */
  readonly vencePlazoEn: null;
}

/** Área máxima de la licencia provisional para bodegas (FR-015). */
export const AREA_MAXIMA_BODEGA_M2 = 50;

const LIMITES = {
  nombre: 150,
  razonSocial: 200,
  nombreComercial: 200,
  giro: 150,
  direccion: 300,
  zona: 60,
};
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const revisarTexto = (
  errores: ErrorCampoSolicitud[],
  campo: string,
  valor: string | null,
  maximo: number,
  obligatorio: boolean,
): void => {
  const largo = valor?.trim().length ?? 0;
  if (obligatorio && largo === 0) {
    errores.push({ campo, mensaje: 'Este dato es obligatorio' });
  } else if (largo > maximo) {
    errores.push({ campo, mensaje: `No puede superar ${String(maximo)} caracteres` });
  }
};

/**
 * Revisa los datos del titular y del establecimiento (FR-009, FR-015). Devuelve todos los errores; la
 * licencia de bodega (ruta C) exige el área y no admite más de 50 m².
 */
export const revisarDatosSolicitud = (
  titular: Pick<TitularSolicitud, 'nombre' | 'razonSocial' | 'correo'>,
  establecimiento: Establecimiento,
  receta: RecetaAlPresentar,
): ErrorCampoSolicitud[] => {
  const errores: ErrorCampoSolicitud[] = [];
  revisarTexto(errores, 'nombreTitular', titular.nombre, LIMITES.nombre, true);
  revisarTexto(errores, 'razonSocial', titular.razonSocial, LIMITES.razonSocial, false);
  if (titular.correo !== null && !CORREO.test(titular.correo.trim())) {
    errores.push({ campo: 'correo', mensaje: 'El correo no es válido' });
  }
  revisarTexto(
    errores,
    'nombreComercial',
    establecimiento.nombreComercial,
    LIMITES.nombreComercial,
    false,
  );
  revisarTexto(errores, 'giro', establecimiento.giro, LIMITES.giro, true);
  revisarTexto(errores, 'direccion', establecimiento.direccion, LIMITES.direccion, true);
  revisarTexto(errores, 'zona', establecimiento.zona, LIMITES.zona, true);

  const area = establecimiento.areaM2;
  if (
    area !== null &&
    (!Number.isFinite(area) || area <= 0 || Math.abs(Math.round(area * 100) - area * 100) > 1e-6)
  ) {
    errores.push({
      campo: 'areaM2',
      mensaje: 'Debe ser un número mayor que 0 con 2 decimales como máximo',
    });
  } else if (receta.ruta === 'C') {
    if (area === null) {
      errores.push({ campo: 'areaM2', mensaje: 'Indica el área de la bodega' });
    } else if (area > AREA_MAXIMA_BODEGA_M2) {
      errores.push({
        campo: 'areaM2',
        mensaje: `La licencia provisional para bodegas admite hasta ${String(AREA_MAXIMA_BODEGA_M2)} m²`,
      });
    }
  }
  return errores;
};

export interface DatosNuevoExpediente {
  readonly numero: NumeroExpediente;
  readonly receta: RecetaAlPresentar;
  readonly canal: Canal;
  readonly titular: TitularSolicitud;
  readonly representante: RepresentanteSolicitud | null;
  readonly establecimiento: Establecimiento;
  readonly documentos: readonly DocumentoDelExpediente[];
  readonly presentadoEn: Date;
  readonly registradoPor: string | null;
  readonly verificacionId: string | null;
}

const limpiar = (texto: string | null): string | null => {
  const recortado = texto?.trim() ?? '';
  return recortado === '' ? null : recortado;
};

/** Crea el expediente REGISTRADO con su primer registro del historial (FR-016). */
export const crearExpediente = (datos: DatosNuevoExpediente): Expediente => {
  const errores = revisarDatosSolicitud(datos.titular, datos.establecimiento, datos.receta);
  if (
    datos.canal === 'EN_LINEA' &&
    (datos.verificacionId === null || datos.registradoPor !== null)
  ) {
    errores.push({ campo: 'canal', mensaje: 'En línea se presenta con identidad confirmada' });
  }
  if (
    datos.canal === 'MESA_PARTES' &&
    (datos.registradoPor === null || datos.verificacionId !== null)
  ) {
    errores.push({ campo: 'canal', mensaje: 'En mesa de partes se registra con un usuario' });
  }
  if (errores.length > 0) {
    throw new ErrorValidacionSolicitud(errores);
  }

  const expediente: Expediente = {
    numero: datos.numero,
    receta: datos.receta,
    ruta: datos.receta.ruta,
    estado: 'REGISTRADO',
    canal: datos.canal,
    titular: {
      ...datos.titular,
      nombre: datos.titular.nombre.trim(),
      correo: limpiar(datos.titular.correo),
      razonSocial: limpiar(datos.titular.razonSocial),
    },
    representante: datos.representante,
    establecimiento: {
      ...datos.establecimiento,
      nombreComercial: limpiar(datos.establecimiento.nombreComercial),
      giro: datos.establecimiento.giro.trim(),
      direccion: datos.establecimiento.direccion.trim(),
      zona: datos.establecimiento.zona.trim(),
    },
    documentos: [...datos.documentos],
    presentadoEn: datos.presentadoEn,
    registradoPor: datos.registradoPor,
    verificacionId: datos.verificacionId,
    historial: [
      {
        estadoAnterior: null,
        estadoNuevo: 'REGISTRADO',
        usuarioId: datos.registradoPor,
        comentario:
          datos.canal === 'EN_LINEA' ? 'Presentada en línea' : 'Registrada en mesa de partes',
        ocurridoEn: datos.presentadoEn,
      },
    ],
    vencePlazoEn: null,
  };
  return Object.freeze(expediente);
};
