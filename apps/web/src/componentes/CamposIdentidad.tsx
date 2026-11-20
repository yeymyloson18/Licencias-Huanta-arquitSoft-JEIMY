import { useId } from 'react';
import type { IdentidadSolicitud } from '../servicios/clienteApi';
import { CampoFormulario } from './CampoFormulario';

// Campos de identidad del titular (y del representante) de la 004. Los usan la identidad en línea y
// el registro de mesa de partes, con los mismos nombres y errores por campo.

type TipoDocumento = 'DNI' | 'CE';

export interface DatosPersona {
  readonly tipoDocumento: TipoDocumento;
  readonly numeroDocumento: string;
  readonly fechaEmision: string;
}

export interface IdentidadEscrita {
  readonly titular: DatosPersona;
  readonly ruc: string;
  readonly celular: string;
  readonly conRepresentante: boolean;
  readonly representante: DatosPersona;
}

const PERSONA_VACIA: DatosPersona = { tipoDocumento: 'DNI', numeroDocumento: '', fechaEmision: '' };

export const IDENTIDAD_VACIA: IdentidadEscrita = {
  titular: PERSONA_VACIA,
  ruc: '',
  celular: '',
  conRepresentante: false,
  representante: PERSONA_VACIA,
};

const aPersona = (datos: DatosPersona) => ({
  tipoDocumento: datos.tipoDocumento,
  numeroDocumento: datos.numeroDocumento.trim().toUpperCase(),
  ...(datos.tipoDocumento === 'DNI' ? { fechaEmision: datos.fechaEmision } : {}),
});

const dePersona = (persona: {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaEmision?: string | null;
}): DatosPersona => ({
  tipoDocumento: persona.tipoDocumento,
  numeroDocumento: persona.numeroDocumento,
  fechaEmision: persona.fechaEmision ?? '',
});

/** Lo escrito → cuerpo `SolicitudVerificacionIdentidad` del contrato. */
export const aIdentidadSolicitud = (escrita: IdentidadEscrita): IdentidadSolicitud => ({
  ...aPersona(escrita.titular),
  ruc: escrita.ruc.trim(),
  celular: escrita.celular.trim(),
  ...(escrita.conRepresentante ? { representante: aPersona(escrita.representante) } : {}),
});

/** Cuerpo del contrato → lo escrito (para volver a mostrar lo que ya se ingresó). */
export const deIdentidadSolicitud = (identidad: IdentidadSolicitud): IdentidadEscrita => ({
  titular: dePersona(identidad),
  ruc: identidad.ruc,
  celular: identidad.celular,
  conRepresentante: identidad.representante !== undefined,
  representante: identidad.representante ? dePersona(identidad.representante) : PERSONA_VACIA,
});

interface PropiedadesPersona {
  readonly prefijo: string;
  readonly titulo: string;
  readonly datos: DatosPersona;
  readonly errores: Readonly<Record<string, string>>;
  readonly alCambiar: (datos: DatosPersona) => void;
}

/** Tipo, número y fecha de emisión (solo DNI) del titular o del representante. */
function DatosDocumento({ prefijo, titulo, datos, errores, alCambiar }: PropiedadesPersona) {
  const idTipo = useId();
  return (
    <fieldset className="formulario__seccion">
      <legend>{titulo}</legend>
      <div className="campo">
        <label className="campo__etiqueta" htmlFor={idTipo}>
          Tipo de documento
        </label>
        <select
          id={idTipo}
          className="campo__entrada"
          value={datos.tipoDocumento}
          onChange={(evento) => {
            alCambiar({ ...datos, tipoDocumento: evento.target.value as TipoDocumento });
          }}
        >
          <option value="DNI">DNI</option>
          <option value="CE">Carné de extranjería</option>
        </select>
      </div>
      <CampoFormulario
        etiqueta="Número de documento"
        inputMode={datos.tipoDocumento === 'DNI' ? 'numeric' : 'text'}
        autoComplete="off"
        required
        value={datos.numeroDocumento}
        error={errores[`${prefijo}numeroDocumento`]}
        onChange={(evento) => {
          alCambiar({ ...datos, numeroDocumento: evento.target.value });
        }}
      />
      {datos.tipoDocumento === 'DNI' && (
        <CampoFormulario
          etiqueta="Fecha de emisión del DNI"
          type="date"
          required
          value={datos.fechaEmision}
          error={errores[`${prefijo}fechaEmision`]}
          onChange={(evento) => {
            alCambiar({ ...datos, fechaEmision: evento.target.value });
          }}
        />
      )}
    </fieldset>
  );
}

interface Propiedades {
  readonly valor: IdentidadEscrita;
  /** Errores por campo, con los nombres del contrato (`ruc`, `representante.numeroDocumento`…). */
  readonly errores: Readonly<Record<string, string>>;
  readonly alCambiar: (valor: IdentidadEscrita) => void;
  /** Ayuda bajo el celular (en línea: "Te enviaremos aquí el código"). */
  readonly ayudaCelular?: string;
  /** Texto de la casilla del representante (en línea habla la propia persona). */
  readonly etiquetaRepresentante?: string;
}

export function CamposIdentidad({
  valor,
  errores,
  alCambiar,
  ayudaCelular,
  etiquetaRepresentante = 'Actúo como representante legal o apoderado',
}: Propiedades) {
  return (
    <>
      <DatosDocumento
        prefijo=""
        titulo="Titular"
        datos={valor.titular}
        errores={errores}
        alCambiar={(titular) => {
          alCambiar({ ...valor, titular });
        }}
      />
      <CampoFormulario
        etiqueta="RUC"
        inputMode="numeric"
        autoComplete="off"
        required
        value={valor.ruc}
        error={errores.ruc}
        onChange={(evento) => {
          alCambiar({ ...valor, ruc: evento.target.value });
        }}
      />
      <CampoFormulario
        etiqueta="Celular"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        required
        ayuda={ayudaCelular}
        value={valor.celular}
        error={errores.celular}
        onChange={(evento) => {
          alCambiar({ ...valor, celular: evento.target.value });
        }}
      />
      <label className="casilla">
        <input
          type="checkbox"
          checked={valor.conRepresentante}
          onChange={(evento) => {
            alCambiar({ ...valor, conRepresentante: evento.target.checked });
          }}
        />
        {etiquetaRepresentante}
      </label>
      {valor.conRepresentante && (
        <DatosDocumento
          prefijo="representante."
          titulo="Representante"
          datos={valor.representante}
          errores={errores}
          alCambiar={(representante) => {
            alCambiar({ ...valor, representante });
          }}
        />
      )}
    </>
  );
}
