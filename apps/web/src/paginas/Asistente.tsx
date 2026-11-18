import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { FichaLicencia } from '../componentes/FichaLicencia';
import {
  obtenerPreguntas,
  proponerLicencia,
  type PreguntaAsistente,
  type ResultadoAsistente,
} from '../servicios/clienteApi';

// Asistente de ruta (historia 1 de la 003, contracts/portal-catalogo.md). Las respuestas viven en la
// URL (?CODIGO=valor…): no son datos personales, sobreviven a una recarga y no se guardan en el
// servidor (FR-009). Los textos de preguntas y opciones vienen siempre de la API (FR-002).

type EstadoPreguntas =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error' }
  | { readonly tipo: 'listas'; readonly preguntas: readonly PreguntaAsistente[] };

type EstadoPropuesta =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error' }
  | { readonly tipo: 'lista'; readonly resultado: ResultadoAsistente };

interface EstadoNavegacion {
  /** Respuesta que se quitó con "Volver", para dejarla marcada. */
  readonly seleccion?: string;
}

/** Respuestas válidas de la URL, en orden; se corta en la primera que falta o no es una opción. */
const leerRespuestas = (
  preguntas: readonly PreguntaAsistente[],
  parametros: URLSearchParams,
): [string, string][] => {
  const respuestas: [string, string][] = [];
  for (const pregunta of preguntas) {
    const valor = parametros.get(pregunta.codigo);
    if (valor === null || !pregunta.opciones.some((opcion) => opcion.valor === valor)) {
      break;
    }
    respuestas.push([pregunta.codigo, valor]);
  }
  return respuestas;
};

export function Asistente() {
  const [parametros, setParametros] = useSearchParams();
  const ubicacion = useLocation();
  const [estadoPreguntas, setEstadoPreguntas] = useState<EstadoPreguntas>({ tipo: 'cargando' });
  const [propuesta, setPropuesta] = useState<EstadoPropuesta>({ tipo: 'cargando' });
  const titulo = useRef<HTMLHeadingElement>(null);

  const cargarPreguntas = useCallback(async () => {
    setEstadoPreguntas({ tipo: 'cargando' });
    try {
      setEstadoPreguntas({ tipo: 'listas', preguntas: await obtenerPreguntas() });
    } catch {
      setEstadoPreguntas({ tipo: 'error' });
    }
  }, []);

  useEffect(() => {
    void cargarPreguntas();
  }, [cargarPreguntas]);

  const preguntas = estadoPreguntas.tipo === 'listas' ? estadoPreguntas.preguntas : [];
  const respuestas = useMemo(() => leerRespuestas(preguntas, parametros), [preguntas, parametros]);
  const completas = preguntas.length > 0 && respuestas.length === preguntas.length;
  const actual = completas ? undefined : preguntas[respuestas.length];
  // Forma canónica de las respuestas válidas (la misma que debe quedar en la URL).
  const claveRespuestas = new URLSearchParams(respuestas).toString();

  // Descarta de la URL los parámetros desconocidos o inválidos (sin crear una entrada de historial).
  useEffect(() => {
    if (estadoPreguntas.tipo !== 'listas') return;
    if (claveRespuestas !== parametros.toString()) {
      setParametros(new URLSearchParams(claveRespuestas), { replace: true });
    }
  }, [estadoPreguntas.tipo, claveRespuestas, parametros, setParametros]);

  const pedirPropuesta = useCallback(async (clave: string) => {
    setPropuesta({ tipo: 'cargando' });
    try {
      setPropuesta({
        tipo: 'lista',
        resultado: await proponerLicencia(Object.fromEntries(new URLSearchParams(clave))),
      });
    } catch {
      setPropuesta({ tipo: 'error' });
    }
  }, []);

  useEffect(() => {
    // Se pide una sola vez por combinación de respuestas.
    if (completas) {
      void pedirPropuesta(claveRespuestas);
    }
  }, [completas, claveRespuestas, pedirPropuesta]);

  // Al cambiar de pregunta o mostrar el resultado, el foco va al título (lectores de pantalla).
  useEffect(() => {
    titulo.current?.focus();
  }, [claveRespuestas, estadoPreguntas.tipo, propuesta.tipo]);

  const seleccionInicial = (ubicacion.state as EstadoNavegacion | null)?.seleccion;
  const [seleccion, setSeleccion] = useState<string | undefined>(seleccionInicial);
  useEffect(() => {
    setSeleccion(seleccionInicial);
  }, [claveRespuestas, seleccionInicial]);

  const responder = () => {
    if (!actual || seleccion === undefined) return;
    setParametros(new URLSearchParams([...respuestas, [actual.codigo, seleccion]]));
  };

  const volver = () => {
    const anterior = respuestas.at(-1);
    if (!anterior) return;
    setParametros(new URLSearchParams(respuestas.slice(0, -1)), {
      state: { seleccion: anterior[1] } satisfies EstadoNavegacion,
    });
  };

  const empezarDeNuevo = () => {
    setParametros(new URLSearchParams());
  };

  const cargando =
    estadoPreguntas.tipo === 'cargando' || (completas && propuesta.tipo === 'cargando');

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <p className="cabecera__descripcion">¿Qué licencia necesito?</p>
      </header>

      <main className="contenido asistente">
        {estadoPreguntas.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando preguntas…
          </p>
        )}

        {estadoPreguntas.tipo === 'error' && (
          <ErrorServicio titulo={titulo} alReintentar={() => void cargarPreguntas()} />
        )}

        {actual && (
          <div className="asistente__pregunta">
            <p className="asistente__avance" aria-live="polite">
              Pregunta {respuestas.length + 1} de {preguntas.length}
            </p>
            <fieldset className="asistente__opciones">
              <legend>
                <h1 ref={titulo} tabIndex={-1} className="asistente__titulo">
                  {actual.texto}
                </h1>
              </legend>
              {actual.opciones.map((opcion) => (
                <label key={opcion.valor} className="asistente__opcion">
                  <input
                    type="radio"
                    name={actual.codigo}
                    value={opcion.valor}
                    checked={seleccion === opcion.valor}
                    onChange={() => {
                      setSeleccion(opcion.valor);
                    }}
                  />
                  <span>{opcion.texto}</span>
                </label>
              ))}
            </fieldset>
            <div className="asistente__acciones">
              <button
                type="button"
                onClick={responder}
                className="boton"
                disabled={seleccion === undefined || cargando}
              >
                Siguiente
              </button>
              {respuestas.length > 0 && (
                <button type="button" className="boton boton--secundario" onClick={volver}>
                  Volver
                </button>
              )}
            </div>
          </div>
        )}

        {completas && propuesta.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Buscando tu licencia…
          </p>
        )}

        {completas && propuesta.tipo === 'error' && (
          <ErrorServicio
            titulo={titulo}
            alReintentar={() => void pedirPropuesta(claveRespuestas)}
          />
        )}

        {completas && propuesta.tipo === 'lista' && (
          <section className="asistente__resultado">
            {propuesta.resultado.resultado === 'PROPUESTA' ? (
              <>
                <h1 ref={titulo} tabIndex={-1} className="asistente__titulo">
                  Esta es la licencia que te corresponde
                </h1>
                <p className="aviso aviso--info">
                  Esta propuesta es orientativa: la municipalidad confirma el nivel de riesgo al
                  evaluar tu solicitud.
                </p>
                <FichaLicencia receta={propuesta.resultado.receta} />
              </>
            ) : (
              <>
                <h1 ref={titulo} tabIndex={-1} className="asistente__titulo">
                  No pudimos determinar tu licencia con tus respuestas
                </h1>
                <p className="aviso">
                  Acércate a la Subgerencia de Comercio, Licencias y Control Sanitario de la
                  Municipalidad Provincial de Huanta para que te orienten.
                </p>
              </>
            )}
          </section>
        )}

        {(completas || respuestas.length > 0) && (
          <div className="asistente__acciones">
            {completas && (
              <button
                type="button"
                className="boton boton--secundario"
                onClick={volver}
                disabled={cargando}
              >
                Volver
              </button>
            )}
            <button
              type="button"
              className="boton boton--secundario"
              onClick={empezarDeNuevo}
              disabled={cargando}
            >
              Empezar de nuevo
            </button>
          </div>
        )}
      </main>
    </>
  );
}

interface PropiedadesError {
  readonly titulo: RefObject<HTMLHeadingElement | null>;
  readonly alReintentar: () => void;
}

/** Servicio no disponible: mensaje sin detalles técnicos y opción de reintentar. */
function ErrorServicio({ titulo, alReintentar }: PropiedadesError) {
  return (
    <div className="aviso aviso--error" role="alert">
      <h1 ref={titulo} tabIndex={-1} className="asistente__titulo">
        El asistente no está disponible en este momento
      </h1>
      <p>Vuelve a intentarlo en unos minutos.</p>
      <button type="button" className="boton" onClick={alReintentar}>
        Reintentar
      </button>
    </div>
  );
}
