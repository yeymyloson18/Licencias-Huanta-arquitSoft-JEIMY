import { type SyntheticEvent, useId, useState } from 'react';
import {
  confirmarRiesgo,
  denegarExpediente,
  type Expediente,
  iniciarEvaluacion,
  observarExpediente,
  type ResultadoDecision,
} from '../servicios/clienteApi';
import { formatearTasaFicha } from './formato';

// Botones del evaluador en el detalle del expediente (contracts/portal-evaluacion-pago.md de la 005).
// Solo se muestran los que corresponden al estado; cada acción envía la versión leída.

const MINIMO = 10;
const MAXIMO = 1000;

type Panel = 'riesgo' | 'observar' | 'denegar' | null;

interface Propiedades {
  readonly expediente: Expediente & {
    readonly licenciasDelGrupo?: readonly {
      codigoReceta: string;
      nombre: string;
      tasa: string;
      ruta: string;
    }[];
  };
  /** La decisión se guardó: el detalle actualizado. */
  readonly alActualizar: (expediente: Expediente) => void;
  /** Otro usuario cambió el expediente: hay que volver a cargarlo y avisar. */
  readonly alCambiar: (mensaje: string) => void;
}

interface PropiedadesTexto {
  readonly etiqueta: string;
  readonly valor: string;
  readonly error: string | null;
  readonly alCambiar: (valor: string) => void;
}

/** Área de texto con contador de 10 a 1,000 caracteres. */
function TextoDecision({ etiqueta, valor, error, alCambiar }: PropiedadesTexto) {
  const id = useId();
  const largo = valor.trim().length;
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <textarea
        id={id}
        className="campo__entrada"
        rows={4}
        maxLength={MAXIMO}
        value={valor}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-contador${error ? ` ${id}-error` : ''}`}
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
      />
      <p className="campo__ayuda" id={`${id}-contador`}>
        {largo} de {MAXIMO} caracteres (mínimo {MINIMO})
      </p>
      {error && (
        <p className="campo__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function AccionesEvaluador({ expediente, alActualizar, alCambiar }: Propiedades) {
  const idLicencia = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [licencia, setLicencia] = useState(expediente.codigoReceta);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { numero, version, estado } = expediente;

  const abrir = (siguiente: Panel) => {
    setPanel(siguiente);
    setTexto('');
    setError(null);
    setLicencia(expediente.codigoReceta);
  };

  const atender = (resultado: ResultadoDecision) => {
    switch (resultado.tipo) {
      case 'ok':
        setPanel(null);
        alActualizar(resultado.expediente);
        return;
      case 'invalido':
        setError(resultado.errores[0]?.mensaje ?? 'Revisa los datos.');
        return;
      case 'cambio':
        setPanel(null);
        alCambiar(`${resultado.mensaje} Volvimos a cargarlo.`);
        return;
      case 'sin-permiso':
        setError('No tienes permiso para esta acción.');
        return;
      case 'no-encontrado':
        setError('El expediente ya no existe.');
        return;
      case 'no-disponible':
        setError('No se pudo guardar. Vuelve a intentarlo en unos minutos.');
        return;
    }
  };

  const enviar = async (accion: () => Promise<ResultadoDecision>) => {
    setEnviando(true);
    setError(null);
    atender(await accion());
    setEnviando(false);
  };

  const conTexto = (
    evento: SyntheticEvent,
    accion: (valor: string) => Promise<ResultadoDecision>,
  ) => {
    evento.preventDefault();
    const valor = texto.trim();
    if (valor.length < MINIMO) {
      setError(`Escribe al menos ${String(MINIMO)} caracteres.`);
      return;
    }
    void enviar(() => accion(valor));
  };

  const licencias = expediente.licenciasDelGrupo ?? [];

  if (estado === 'REGISTRADO') {
    return (
      <section className="acciones" aria-label="Acciones del evaluador">
        <button
          type="button"
          className="boton"
          disabled={enviando}
          onClick={() => void enviar(() => iniciarEvaluacion(numero, version))}
        >
          Empezar revisión
        </button>
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (estado !== 'EN_EVALUACION') {
    return null;
  }

  const yaObservado = expediente.observaciones !== undefined && expediente.observaciones.length > 0;

  return (
    <section className="acciones" aria-label="Acciones del evaluador">
      <div className="formulario__acciones">
        <button
          type="button"
          className="boton"
          onClick={() => {
            abrir('riesgo');
          }}
        >
          Confirmar riesgo
        </button>
        {!yaObservado && (
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => {
              abrir('observar');
            }}
          >
            Observar
          </button>
        )}
        <button
          type="button"
          className="boton boton--secundario"
          onClick={() => {
            abrir('denegar');
          }}
        >
          Denegar
        </button>
      </div>

      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      {panel === 'riesgo' && (
        <form
          className="formulario"
          onSubmit={(evento) => {
            evento.preventDefault();
            void enviar(() =>
              confirmarRiesgo(
                numero,
                version,
                licencia === expediente.codigoReceta ? {} : { codigoReceta: licencia },
              ),
            );
          }}
        >
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={idLicencia}>
              Licencia confirmada
            </label>
            <select
              id={idLicencia}
              className="campo__entrada"
              value={licencia}
              onChange={(evento) => {
                setLicencia(evento.target.value);
              }}
            >
              {licencias.map((opcion) => (
                <option key={opcion.codigoReceta} value={opcion.codigoReceta}>
                  {opcion.nombre} — {formatearTasaFicha(opcion.tasa)}
                  {opcion.codigoReceta === expediente.codigoReceta ? ' (presentada)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="formulario__acciones">
            <button type="submit" className="boton" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Confirmar y generar esquela'}
            </button>
            <button
              type="button"
              className="boton boton--claro"
              onClick={() => {
                abrir(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {panel === 'observar' && (
        <form
          className="formulario"
          onSubmit={(evento) => {
            conTexto(evento, (valor) => observarExpediente(numero, version, valor));
          }}
        >
          <TextoDecision etiqueta="Qué falta" valor={texto} error={null} alCambiar={setTexto} />
          <div className="formulario__acciones">
            <button type="submit" className="boton" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Observar expediente'}
            </button>
            <button
              type="button"
              className="boton boton--claro"
              onClick={() => {
                abrir(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {panel === 'denegar' && (
        <form
          className="formulario"
          onSubmit={(evento) => {
            conTexto(evento, (valor) => denegarExpediente(numero, version, valor));
          }}
        >
          <TextoDecision
            etiqueta="Motivo de la denegación"
            valor={texto}
            error={null}
            alCambiar={setTexto}
          />
          <div className="formulario__acciones">
            <button type="submit" className="boton" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Denegar expediente'}
            </button>
            <button
              type="button"
              className="boton boton--claro"
              onClick={() => {
                abrir(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
