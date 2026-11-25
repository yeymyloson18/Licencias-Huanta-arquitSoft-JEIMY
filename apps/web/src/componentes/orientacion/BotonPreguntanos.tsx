import { useState } from 'react';
import { ChatOrientacion } from './ChatOrientacion';
import type { MensajeChat } from './conversacion';

// Botón "Pregúntanos" de las páginas públicas (012, FR-001). Abre y cierra el chat; la conversación
// la guarda el diseño común para que siga al cerrar y abrir, o al cambiar de página pública.

interface Propiedades {
  readonly conversacion: readonly MensajeChat[];
  readonly alCambiar: (conversacion: MensajeChat[]) => void;
}

export function BotonPreguntanos({ conversacion, alCambiar }: Propiedades) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="orientacion">
      {abierto && (
        <ChatOrientacion
          conversacion={conversacion}
          alCambiar={alCambiar}
          alCerrar={() => {
            setAbierto(false);
          }}
        />
      )}
      <button
        type="button"
        className="boton boton-preguntanos"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => {
          setAbierto((valor) => !valor);
        }}
      >
        Pregúntanos
      </button>
    </div>
  );
}
