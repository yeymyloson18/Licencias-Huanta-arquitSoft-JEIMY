import { type ChangeEvent, type SyntheticEvent, useEffect, useId, useRef, useState } from 'react';
import type { Receta, ResultadoSubida } from '../servicios/clienteApi';
import type { BorradorSolicitud, DocumentoSubido } from '../tramite/ContextoTramite';
import { CampoFormulario } from './CampoFormulario';
import { etiquetaCondicion } from './formato';

// Formulario de la solicitud (CU04 de la 004, contracts/portal-tramite.md). Lo usa el trámite en
// línea y lo usará el registro presencial de mesa de partes (historia 3). No envía nada por sí
// mismo: la página decide cómo subir los documentos y cómo presentar.

export const AREA_MAXIMA_BODEGA_M2 = 50;

type Requisito = Receta['requisitos'][number];
type Clase = 'OBLIGATORIO' | 'OPCIONAL' | 'NO_APLICA';

/** Misma regla que el dominio de Trámites (politica-requisitos.ts de la API). */
export const claseRequisito = (requisito: Requisito, conRepresentante: boolean): Clase => {
  switch (requisito.condicion) {
    case 'CON_REPRESENTANTE':
      return conRepresentante ? 'OBLIGATORIO' : 'NO_APLICA';
    case 'GIRO_ESPECIAL':
    case 'SIN_PLANOS_VIGENTES':
      return 'OPCIONAL';
    case 'SIEMPRE':
      return requisito.obligatorio ? 'OBLIGATORIO' : 'OPCIONAL';
  }
};

export const campoRequisito = (requisitoId: number) =>
  `documentos.requisito.${String(requisitoId)}`;

/** Revisión previa en el navegador; la API vuelve a revisar todo. */
export const revisarFormulario = (
  receta: Receta,
  conRepresentante: boolean,
  borrador: BorradorSolicitud,
  documentos: Readonly<Record<number, DocumentoSubido>>,
): Record<string, string> => {
  const errores: Record<string, string> = {};
  const obligatorios: [keyof BorradorSolicitud, string][] = [
    ['nombreTitular', 'Escribe el nombre completo del titular'],
    ['giro', 'Escribe el giro del negocio'],
    ['direccion', 'Escribe la dirección del establecimiento'],
    ['zona', 'Escribe la zona o barrio'],
  ];
  for (const [campo, mensaje] of obligatorios) {
    if (borrador[campo].trim() === '') {
      errores[campo] = mensaje;
    }
  }
  if (borrador.correo.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borrador.correo.trim())) {
    errores.correo = 'El correo no es válido';
  }
  const area = borrador.areaM2.trim() === '' ? null : Number(borrador.areaM2.replace(',', '.'));
  if (area !== null && (!Number.isFinite(area) || area <= 0)) {
    errores.areaM2 = 'El área debe ser un número mayor que 0';
  } else if (receta.ruta === 'C' && area === null) {
    errores.areaM2 = 'Escribe el área del local';
  } else if (receta.ruta === 'C' && area !== null && area > AREA_MAXIMA_BODEGA_M2) {
    errores.areaM2 = `Esta licencia es solo para bodegas de hasta ${String(AREA_MAXIMA_BODEGA_M2)} m²`;
  }
  for (const requisito of receta.requisitos) {
    if (
      claseRequisito(requisito, conRepresentante) === 'OBLIGATORIO' &&
      documentos[requisito.id] === undefined
    ) {
      errores[campoRequisito(requisito.id)] = 'Adjunta este documento';
    }
  }
  return errores;
};

/** Copia sin la entrada de `clave`. */
const sinClave = <T,>(registro: Readonly<Record<number, T>>, clave: number): Record<number, T> =>
  Object.fromEntries(Object.entries(registro).filter(([id]) => Number(id) !== clave));

type EstadoSubida =
  { readonly tipo: 'subiendo' } | { readonly tipo: 'rechazado'; readonly motivo: string };

const MOTIVOS: Record<Exclude<ResultadoSubida['tipo'], 'ok'>, string> = {
  'demasiado-grande': 'El archivo pesa más de 10 MB.',
  'tipo-no-permitido': 'Solo se aceptan archivos PDF, JPG o PNG.',
  'no-autenticado': 'Tu permiso venció. Vuelve a confirmar tu identidad.',
  'no-disponible': 'No se pudo subir. Inténtalo de nuevo.',
};

interface PropiedadesDocumento {
  readonly requisito: Requisito;
  readonly clase: Exclude<Clase, 'NO_APLICA'>;
  readonly documento: DocumentoSubido | undefined;
  readonly estado: EstadoSubida | undefined;
  readonly error: string | undefined;
  readonly alElegir: (archivo: File) => void;
}

function DocumentoRequisito({
  requisito,
  clase,
  documento,
  estado,
  error,
  alElegir,
}: PropiedadesDocumento) {
  const id = useId();
  const explicacion = clase === 'OPCIONAL' ? etiquetaCondicion(requisito.condicion) : null;
  const mensaje = estado?.tipo === 'rechazado' ? estado.motivo : error;
  const idMensaje = `${id}-mensaje`;

  const alCambiar = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    if (archivo !== undefined) {
      alElegir(archivo);
    }
    evento.target.value = '';
  };

  return (
    <li className="documento">
      <p className="documento__nombre">
        {requisito.descripcion}{' '}
        <span className="etiqueta">{clase === 'OBLIGATORIO' ? 'Obligatorio' : 'Opcional'}</span>
      </p>
      {explicacion && <p className="campo__ayuda">{explicacion}</p>}
      <label className="boton boton--secundario documento__subir" htmlFor={id}>
        {documento ? 'Reemplazar archivo' : 'Subir archivo'}
        <span className="solo-lectores">: {requisito.descripcion}</span>
      </label>
      <input
        id={id}
        className="documento__archivo"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        aria-invalid={mensaje ? true : undefined}
        aria-describedby={mensaje ? idMensaje : undefined}
        disabled={estado?.tipo === 'subiendo'}
        onChange={alCambiar}
      />
      <p className="documento__estado" role="status">
        {estado?.tipo === 'subiendo' && 'Subiendo…'}
        {estado === undefined && documento && `Listo: ${documento.nombre}`}
      </p>
      {mensaje && (
        <p className="campo__error" id={idMensaje}>
          {mensaje}
        </p>
      )}
    </li>
  );
}

export interface PropiedadesFormulario {
  readonly receta: Receta;
  readonly conRepresentante: boolean;
  readonly borrador: BorradorSolicitud;
  readonly documentos: Readonly<Record<number, DocumentoSubido>>;
  readonly errores: Readonly<Record<string, string>>;
  readonly enviando: boolean;
  readonly alCambiarBorrador: (borrador: BorradorSolicitud) => void;
  readonly subirDocumento: (archivo: File) => Promise<ResultadoSubida>;
  readonly alGuardarDocumento: (requisitoId: number, documento: DocumentoSubido) => void;
  /** Un documento se rechazó porque el permiso venció. */
  readonly alPerderPermiso?: () => void;
  readonly alPresentar: () => void;
}

const ETIQUETAS: Record<string, string> = {
  nombreTitular: 'Nombre completo del titular',
  razonSocial: 'Razón social de la empresa',
  correo: 'Correo',
  nombreComercial: 'Nombre comercial',
  giro: 'Giro',
  direccion: 'Dirección',
  zona: 'Zona',
  areaM2: 'Área del local',
};

export function FormularioSolicitud({
  receta,
  conRepresentante,
  borrador,
  documentos,
  errores,
  enviando,
  alCambiarBorrador,
  subirDocumento,
  alGuardarDocumento,
  alPerderPermiso,
  alPresentar,
}: PropiedadesFormulario) {
  const resumen = useRef<HTMLDivElement>(null);
  const [subidas, setSubidas] = useState<Record<number, EstadoSubida>>({});
  const listaErrores = Object.entries(errores);

  // El resumen de errores recibe el foco cada vez que aparecen errores nuevos.
  useEffect(() => {
    if (Object.keys(errores).length > 0) {
      resumen.current?.focus();
    }
  }, [errores]);

  const requisitos = [...receta.requisitos]
    .sort((a, b) => a.orden - b.orden)
    .map((requisito) => ({ requisito, clase: claseRequisito(requisito, conRepresentante) }))
    .filter(
      (item): item is { requisito: Requisito; clase: Exclude<Clase, 'NO_APLICA'> } =>
        item.clase !== 'NO_APLICA',
    );

  const etiquetaDe = (campo: string): string => {
    const requisito = receta.requisitos.find((r) => campoRequisito(r.id) === campo);
    return requisito ? requisito.descripcion : (ETIQUETAS[campo] ?? 'Solicitud');
  };

  const elegirArchivo = async (requisitoId: number, archivo: File) => {
    setSubidas((actuales) => ({ ...actuales, [requisitoId]: { tipo: 'subiendo' } }));
    const resultado = await subirDocumento(archivo);
    if (resultado.tipo === 'ok') {
      alGuardarDocumento(requisitoId, { documentoId: resultado.documentoId, nombre: archivo.name });
      setSubidas((actuales) => sinClave(actuales, requisitoId));
      return;
    }
    setSubidas((actuales) => ({
      ...actuales,
      [requisitoId]: { tipo: 'rechazado', motivo: MOTIVOS[resultado.tipo] },
    }));
    if (resultado.tipo === 'no-autenticado') {
      alPerderPermiso?.();
    }
  };

  const campo = (nombre: keyof BorradorSolicitud) => ({
    value: borrador[nombre],
    error: errores[nombre],
    onChange: (evento: ChangeEvent<HTMLInputElement>) => {
      alCambiarBorrador({ ...borrador, [nombre]: evento.target.value });
    },
  });

  const alEnviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    alPresentar();
  };

  const subiendo = Object.values(subidas).some((estado) => estado.tipo === 'subiendo');

  return (
    <form className="formulario" onSubmit={alEnviar} noValidate>
      {listaErrores.length > 0 && (
        <div className="aviso aviso--error" ref={resumen} tabIndex={-1} role="alert">
          <p>Revisa estos datos antes de presentar:</p>
          <ul>
            {listaErrores.map(([nombre, mensaje]) => (
              <li key={nombre}>
                {etiquetaDe(nombre)}: {mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="formulario__seccion">
        <legend>Titular</legend>
        <CampoFormulario
          etiqueta={ETIQUETAS.nombreTitular ?? ''}
          autoComplete="name"
          required
          {...campo('nombreTitular')}
        />
        <CampoFormulario
          etiqueta="Razón social de la empresa (opcional)"
          ayuda="Solo si el titular es una empresa."
          {...campo('razonSocial')}
        />
        <CampoFormulario
          etiqueta="Correo (opcional)"
          type="email"
          autoComplete="email"
          ayuda="Te escribiremos sobre tu trámite si lo indicas."
          {...campo('correo')}
        />
      </fieldset>

      <fieldset className="formulario__seccion">
        <legend>Establecimiento</legend>
        <CampoFormulario etiqueta="Nombre comercial (opcional)" {...campo('nombreComercial')} />
        <CampoFormulario etiqueta="Giro" required {...campo('giro')} />
        <CampoFormulario
          etiqueta="Dirección"
          autoComplete="street-address"
          required
          {...campo('direccion')}
        />
        <CampoFormulario etiqueta="Zona" required {...campo('zona')} />
        <CampoFormulario
          etiqueta="Área del local en m²"
          inputMode="decimal"
          required={receta.ruta === 'C'}
          ayuda={
            receta.ruta === 'C'
              ? `Solo para bodegas de hasta ${String(AREA_MAXIMA_BODEGA_M2)} m².`
              : undefined
          }
          {...campo('areaM2')}
        />
      </fieldset>

      <fieldset className="formulario__seccion">
        <legend>Documentos</legend>
        <p className="campo__ayuda">PDF, JPG o PNG de hasta 10 MB cada uno.</p>
        <ul className="documentos">
          {requisitos.map(({ requisito, clase }) => (
            <DocumentoRequisito
              key={requisito.id}
              requisito={requisito}
              clase={clase}
              documento={documentos[requisito.id]}
              estado={subidas[requisito.id]}
              error={errores[campoRequisito(requisito.id)]}
              alElegir={(archivo) => void elegirArchivo(requisito.id, archivo)}
            />
          ))}
        </ul>
      </fieldset>

      <div className="formulario__acciones">
        <button type="submit" className="boton" disabled={enviando || subiendo}>
          {enviando ? 'Presentando…' : 'Presentar solicitud'}
        </button>
      </div>
    </form>
  );
}
