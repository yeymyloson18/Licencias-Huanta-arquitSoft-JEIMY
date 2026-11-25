import { type SyntheticEvent, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  preguntarOrientacion,
  type ResultadoPreguntaOrientacion,
} from '../../servicios/clienteApi';
import {
  historialDe,
  type MensajeChat,
  siguienteId,
  TEXTO_NO_DISPONIBLE,
  textoLimite,
} from './conversacion';
import { enlaceInterno } from './enlacesOrientacion';

// Chat de orientación (012, contracts/portal-orientacion.md). El texto de las respuestas se muestra
// como texto plano (nunca como HTML) y la conversación vive en el diseño común (FR-017).

const LARGO_MAXIMO = 500;

/** FR-016: se muestra cuando el servidor quitó un dato personal de la pregunta o del historial. */
const AVISO_DATO_PERSONAL =
  'Por su seguridad, quitamos sus datos personales de la pregunta. No hace falta escribirlos aquí.';

const EJEMPLOS = [
  '¿Qué licencia necesito para una bodega?',
  '¿Cuánto cuesta y cuánto demora?',
  '¿Cómo pago?',
];

const respuestaDe = (id: number, resultado: ResultadoPreguntaOrientacion): MensajeChat => {
  switch (resultado.tipo) {
    case 'ok':
      return {
        id,
        autor: 'ORIENTADOR',
        texto: resultado.datos.texto,
        enlaces: resultado.datos.enlaces,
        aclaracion: resultado.datos.aclaracion,
        datoPersonalQuitado: resultado.datos.datoPersonalQuitado,
      };
    case 'limite':
      return {
        id,
        autor: 'ORIENTADOR',
        texto: textoLimite(resultado.segundos),
        enlaces: [{ tipo: 'ASISTENTE' }],
      };
    case 'no-disponible':
      return {
        id,
        autor: 'ORIENTADOR',
        texto: TEXTO_NO_DISPONIBLE,
        enlaces: [{ tipo: 'ASISTENTE' }, { tipo: 'LICENCIAS' }],
      };
  }
};

interface Propiedades {
  readonly conversacion: readonly MensajeChat[];
  readonly alCambiar: (conversacion: MensajeChat[]) => void;
  readonly alCerrar: () => void;
}

export function ChatOrientacion({ conversacion, alCambiar, alCerrar }: Propiedades) {
  const idTitulo = useId();
  const idCampo = useId();
  const idContador = useId();
  const [texto, setTexto] = useState('');
  const [esperando, setEsperando] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // US6 (FR-026): diálogo modal con el foco en el campo. `showModal` existe en los navegadores; donde
  // no existe (jsdom de las pruebas) se abre con el atributo `open`.
  useEffect(() => {
    const elemento = dialogo.current;
    if (elemento !== null && !elemento.open) {
      if (typeof elemento.showModal === 'function') {
        elemento.showModal();
      } else {
        elemento.setAttribute('open', '');
      }
    }
    campo.current?.focus();
  }, []);

  const enviar = async (pregunta: string) => {
    const limpia = pregunta.trim();
    if (limpia.length === 0 || esperando) {
      return;
    }
    const historial = historialDe(conversacion);
    const conPregunta = [
      ...conversacion,
      { id: siguienteId(conversacion), autor: 'PERSONA' as const, texto: limpia },
    ];
    alCambiar(conPregunta);
    setTexto('');
    setEsperando(true);
    const resultado = await preguntarOrientacion(limpia, historial);
    setEsperando(false);
    alCambiar([...conPregunta, respuestaDe(siguienteId(conPregunta), resultado)]);
  };

  const alEnviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    void enviar(texto);
  };

  return (
    <dialog
      ref={dialogo}
      className="chat-orientacion"
      aria-labelledby={idTitulo}
      onCancel={(evento) => {
        // Escape en un diálogo modal del navegador.
        evento.preventDefault();
        alCerrar();
      }}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          evento.preventDefault();
          alCerrar();
        }
      }}
    >
      <header className="chat-orientacion__cabecera">
        <h2 id={idTitulo} className="chat-orientacion__titulo">
          Pregúntanos sobre licencias
        </h2>
        <button type="button" className="boton boton--secundario" onClick={alCerrar}>
          Cerrar
        </button>
      </header>

      <div className="chat-orientacion__cuerpo">
        <p className="chat-orientacion__saludo">
          Hola. Puedo orientarle sobre las licencias de funcionamiento del TUPA 2024 de Huanta. Es
          una orientación; no hace falta que escriba su DNI, RUC, celular ni correo.
        </p>
        <ul className="chat-orientacion__ejemplos" aria-label="Preguntas de ejemplo">
          {EJEMPLOS.map((ejemplo) => (
            <li key={ejemplo}>
              <button
                type="button"
                className="chat-orientacion__ejemplo"
                disabled={esperando}
                onClick={() => void enviar(ejemplo)}
              >
                {ejemplo}
              </button>
            </li>
          ))}
        </ul>

        {/* Región viva: cada mensaje nuevo se anuncia sin mover el foco (FR-026). */}
        <ol className="chat-orientacion__mensajes" aria-live="polite" aria-relevant="additions">
          {conversacion.map((mensaje) => (
            <li
              key={mensaje.id}
              className={`chat-orientacion__mensaje chat-orientacion__mensaje--${
                mensaje.autor === 'PERSONA' ? 'persona' : 'orientador'
              }`}
            >
              <p className="chat-orientacion__autor">
                {mensaje.autor === 'PERSONA' ? 'Usted' : 'Orientador'}
              </p>
              <p className="chat-orientacion__texto">{mensaje.texto}</p>
              {mensaje.aclaracion && (
                <p className="chat-orientacion__aclaracion">{mensaje.aclaracion}</p>
              )}
              {mensaje.datoPersonalQuitado && (
                <p className="chat-orientacion__aviso-dato">{AVISO_DATO_PERSONAL}</p>
              )}
              {mensaje.enlaces && mensaje.enlaces.length > 0 && (
                <ul className="chat-orientacion__enlaces">
                  {mensaje.enlaces.map((enlace) => {
                    const interno = enlaceInterno(enlace);
                    return (
                      <li key={`${enlace.tipo}-${enlace.codigoReceta ?? ''}`}>
                        <Link to={interno.ruta} onClick={alCerrar}>
                          {interno.texto}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
        {esperando && (
          <p className="chat-orientacion__esperando" role="status">
            Preparando la respuesta…
          </p>
        )}
      </div>

      <form className="chat-orientacion__formulario" onSubmit={alEnviar}>
        <label htmlFor={idCampo} className="chat-orientacion__etiqueta">
          Escriba su pregunta
        </label>
        <textarea
          ref={campo}
          id={idCampo}
          className="chat-orientacion__campo"
          maxLength={LARGO_MAXIMO}
          rows={2}
          value={texto}
          aria-describedby={idContador}
          onChange={(evento) => {
            setTexto(evento.target.value);
          }}
          onKeyDown={(evento) => {
            // Enter envía; Mayús + Enter hace un salto de línea (contracts/portal-orientacion.md).
            if (evento.key === 'Enter' && !evento.shiftKey) {
              evento.preventDefault();
              void enviar(texto);
            }
          }}
        />
        <p id={idContador} className="chat-orientacion__contador">
          {String(texto.length)} de {String(LARGO_MAXIMO)}
        </p>
        <button type="submit" className="boton" disabled={esperando || texto.trim().length === 0}>
          Enviar
        </button>
      </form>
    </dialog>
  );
}
