import { type InputHTMLAttributes, useId, useState } from 'react';

interface Propiedades extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly etiqueta: string;
  /** Mensaje de error del campo; se anuncia con aria-describedby. */
  readonly error?: string | null;
  /** Ayuda permanente bajo el campo (por ejemplo, la política de clave). */
  readonly ayuda?: string;
}

/** Ojo abierto (mostrar) u ojo tachado (ocultar); decorativo, el botón lleva su propio nombre. */
function IconoOjo({ tachado }: { readonly tachado: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {tachado && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

/**
 * Campo con `label`, ayuda y error accesibles (contracts/portal-seguridad.md). Un campo de clave
 * (`type="password"`) trae el botón del ojo para mostrar u ocultar lo escrito (011): la clave
 * sigue oculta por defecto y nunca se guarda en el navegador.
 */
export function CampoFormulario({ etiqueta, error, ayuda, type, ...entrada }: Propiedades) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripciones = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');
  const esClave = type === 'password';
  const [visible, setVisible] = useState(false);

  const campo = (
    <input
      {...entrada}
      type={esClave && visible ? 'text' : type}
      id={id}
      // 013 (US5): clases de CoreUI por dentro; las propias quedan para el diseño del campo de clave.
      className={`form-control campo__entrada${error ? ' is-invalid' : ''}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={descripciones === '' ? undefined : descripciones}
    />
  );

  return (
    <div className="campo">
      <label className="form-label campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      {esClave ? (
        <div className="campo__clave">
          {campo}
          <button
            type="button"
            className="campo__ojo"
            aria-controls={id}
            aria-pressed={visible}
            aria-label={
              visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`
            }
            onClick={() => {
              setVisible((antes) => !antes);
            }}
          >
            <IconoOjo tachado={visible} />
          </button>
        </div>
      ) : (
        campo
      )}
      {ayuda && (
        <p className="form-text campo__ayuda" id={idAyuda}>
          {ayuda}
        </p>
      )}
      {error && (
        <p className="invalid-feedback d-block campo__error" id={idError}>
          {error}
        </p>
      )}
    </div>
  );
}
