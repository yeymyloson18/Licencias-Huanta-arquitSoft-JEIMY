import { type ReactNode, useEffect, useId, useRef } from 'react';

interface Propiedades {
  readonly titulo: string;
  readonly mensaje: string;
  readonly textoConfirmar: string;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
  /** Deshabilita "Confirmar" mientras se envía. */
  readonly enviando?: boolean;
  /** Campos extra (por ejemplo, la clave temporal). */
  readonly children?: ReactNode;
}

/**
 * Confirmación antes de una acción de la ficha del usuario (FR-019 de la 009). Es un diálogo modal
 * accesible: el foco empieza en "Cancelar" (la opción segura) y `Escape` cancela.
 */
export function Confirmacion({
  titulo,
  mensaje,
  textoConfirmar,
  onConfirmar,
  onCancelar,
  enviando = false,
  children,
}: Propiedades) {
  const id = useId();
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelar.current?.focus();
  }, []);

  return (
    <div className="confirmacion__fondo">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-mensaje`}
        className="confirmacion tarjeta"
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') {
            onCancelar();
          }
        }}
      >
        <h2 id={`${id}-titulo`} className="ficha__nombre">
          {titulo}
        </h2>
        <p id={`${id}-mensaje`}>{mensaje}</p>
        {children}
        <div className="formulario__acciones">
          <button
            ref={cancelar}
            type="button"
            className="btn btn-light boton boton--claro"
            onClick={onCancelar}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary boton"
            disabled={enviando}
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
