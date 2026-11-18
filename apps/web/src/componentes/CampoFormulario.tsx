import { type InputHTMLAttributes, useId } from 'react';

interface Propiedades extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly etiqueta: string;
  /** Mensaje de error del campo; se anuncia con aria-describedby. */
  readonly error?: string | null;
  /** Ayuda permanente bajo el campo (por ejemplo, la política de clave). */
  readonly ayuda?: string;
}

/** Campo con `label`, ayuda y error accesibles (contracts/portal-seguridad.md). */
export function CampoFormulario({ etiqueta, error, ayuda, ...entrada }: Propiedades) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripciones = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');

  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <input
        {...entrada}
        id={id}
        className="campo__entrada"
        aria-invalid={error ? true : undefined}
        aria-describedby={descripciones === '' ? undefined : descripciones}
      />
      {ayuda && (
        <p className="campo__ayuda" id={idAyuda}>
          {ayuda}
        </p>
      )}
      {error && (
        <p className="campo__error" id={idError}>
          {error}
        </p>
      )}
    </div>
  );
}
