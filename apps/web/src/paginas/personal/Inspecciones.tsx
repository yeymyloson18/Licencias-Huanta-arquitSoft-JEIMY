import { type SyntheticEvent, useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import {
  asignarInspeccion,
  type Inspeccion,
  listarInspecciones,
  listarInspectores,
} from '../../servicios/clienteApi';
import { useSesion } from '../../sesion/ProveedorSesion';

// Inspecciones ITSE (historia 2 de la 006, contracts/portal-006.md). La jefatura ve todas y asigna;
// el inspector ve solo las suyas, en tarjetas pensadas para el celular.

type Estado = 'PENDIENTE' | 'ASIGNADA' | 'REALIZADA';

const ESTADOS: Record<Estado, string> = {
  PENDIENTE: 'Pendiente',
  ASIGNADA: 'Asignada',
  REALIZADA: 'Realizada',
};

const TIPOS: Record<string, string> = {
  PREVIA: 'ITSE previa',
  POSTERIOR: 'ITSE posterior',
  BODEGA: 'Bodega',
};

const RESULTADOS: Record<string, string> = {
  FAVORABLE: 'Favorable',
  DESFAVORABLE: 'Desfavorable',
};

/** Hoy en Lima, `AAAA-MM-DD`. */
export const hoyLima = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

/** `AAAA-MM-DD` → "20 nov. 2026". */
export const fechaCorta = (fecha: string | null | undefined): string =>
  fecha
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${fecha}T00:00:00Z`),
      )
    : '—';

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly datos: readonly Inspeccion[] }
  | { readonly tipo: 'error'; readonly mensaje: string };

function FormularioAsignar({
  inspeccion,
  inspectores,
  alAsignar,
  alCancelar,
}: {
  readonly inspeccion: Inspeccion;
  readonly inspectores: readonly { readonly id: string; readonly nombre: string }[];
  readonly alAsignar: (mensaje: string) => void;
  readonly alCancelar: () => void;
}) {
  const id = useId();
  const [inspectorId, setInspectorId] = useState(inspeccion.inspectorId ?? '');
  const [fecha, setFecha] = useState(inspeccion.programadaPara ?? hoyLima());
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (inspectorId === '') {
      setError('Elige un inspector.');
      return;
    }
    setEnviando(true);
    const resultado = await asignarInspeccion(inspeccion.id, inspectorId, fecha);
    setEnviando(false);
    if (resultado.tipo === 'ok') {
      alAsignar(`Inspección de ${inspeccion.numeroExpediente} asignada.`);
      return;
    }
    setError(
      resultado.tipo === 'invalido'
        ? (resultado.errores[0]?.mensaje ?? 'Revisa los datos.')
        : resultado.tipo === 'conflicto'
          ? resultado.mensaje
          : 'No se pudo asignar. Vuelve a intentarlo.',
    );
  };

  return (
    <form
      className="formulario"
      aria-label={`Asignar inspección de ${inspeccion.numeroExpediente}`}
      onSubmit={(evento) => void enviar(evento)}
      noValidate
    >
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-inspector`}>
          Inspector
        </label>
        <select
          id={`${id}-inspector`}
          className="campo__entrada"
          value={inspectorId}
          onChange={(evento) => {
            setInspectorId(evento.target.value);
          }}
        >
          <option value="">Elige un inspector</option>
          {inspectores.map((inspector) => (
            <option key={inspector.id} value={inspector.id}>
              {inspector.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-fecha`}>
          Fecha programada
        </label>
        <input
          id={`${id}-fecha`}
          className="campo__entrada"
          type="date"
          min={hoyLima()}
          value={fecha}
          onChange={(evento) => {
            setFecha(evento.target.value);
          }}
        />
      </div>
      <div className="formulario__acciones">
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar asignación'}
        </button>
        <button type="button" className="boton boton--claro" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Página `/personal/inspecciones`. */
export function Inspecciones() {
  const { sesion } = useSesion();
  const esJefatura = sesion?.usuario.roles.includes('JEFATURA') ?? false;
  const idFiltro = useId();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [inspectores, setInspectores] = useState<
    readonly { readonly id: string; readonly nombre: string }[]
  >([]);
  const [asignando, setAsignando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    const resultado = await listarInspecciones(estado);
    setCarga(
      resultado.tipo === 'ok'
        ? { tipo: 'lista', datos: resultado.datos }
        : {
            tipo: 'error',
            mensaje:
              resultado.tipo === 'sin-permiso'
                ? 'Tu usuario no tiene permiso para ver las inspecciones.'
                : 'No se pudieron cargar las inspecciones. Vuelve a intentarlo.',
          },
    );
  }, [estado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (esJefatura) {
      void listarInspectores().then((lista) => {
        setInspectores(lista ?? []);
      });
    }
  }, [esJefatura]);

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Inspecciones ITSE</h1>
        <p className="cabecera__descripcion">
          {esJefatura
            ? 'Asigna cada inspección a un inspector y una fecha.'
            : 'Las inspecciones que tienes asignadas.'}
        </p>
      </header>
      <main className="contenido">
        {esJefatura && (
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={idFiltro}>
              Estado
            </label>
            <select
              id={idFiltro}
              className="campo__entrada"
              value={estado ?? ''}
              onChange={(evento) => {
                setEstado(evento.target.value === '' ? null : (evento.target.value as Estado));
              }}
            >
              <option value="">Todas</option>
              {Object.entries(ESTADOS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </div>
        )}
        {aviso && (
          <p className="aviso aviso--info" role="status">
            {aviso}
          </p>
        )}
        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando…
          </p>
        )}
        {carga.tipo === 'error' && (
          <p className="aviso aviso--error" role="alert">
            {carga.mensaje}
          </p>
        )}
        {carga.tipo === 'lista' && carga.datos.length === 0 && (
          <p className="aviso">No hay inspecciones.</p>
        )}
        {carga.tipo === 'lista' &&
          carga.datos.map((inspeccion) => (
            <article
              key={inspeccion.id}
              className="tarjeta"
              aria-label={`Inspección de ${inspeccion.numeroExpediente}`}
            >
              <h2 className="ficha__nombre">{inspeccion.numeroExpediente}</h2>
              <dl className="ficha__datos">
                {[
                  ['Tipo', TIPOS[inspeccion.tipo] ?? inspeccion.tipo],
                  ['Estado', ESTADOS[inspeccion.estado]],
                  ['Licencia', inspeccion.nombreLicencia ?? '—'],
                  ['Giro', inspeccion.giro ?? '—'],
                  ...(inspeccion.direccion ? [['Dirección', inspeccion.direccion]] : []),
                  ['Fecha', fechaCorta(inspeccion.programadaPara)],
                  ...(esJefatura ? [['Inspector', inspeccion.nombreInspector ?? '—']] : []),
                  ...(inspeccion.resultado
                    ? [['Resultado', RESULTADOS[inspeccion.resultado] ?? inspeccion.resultado]]
                    : []),
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="ficha__dato">
                    <dt>{etiqueta}</dt>
                    <dd>{valor}</dd>
                  </div>
                ))}
              </dl>
              {esJefatura && inspeccion.estado !== 'REALIZADA' && asignando !== inspeccion.id && (
                <button
                  type="button"
                  className="boton boton--claro"
                  onClick={() => {
                    setAviso(null);
                    setAsignando(inspeccion.id);
                  }}
                >
                  {inspeccion.estado === 'PENDIENTE' ? 'Asignar' : 'Cambiar asignación'}
                </button>
              )}
              {esJefatura && asignando === inspeccion.id && (
                <FormularioAsignar
                  inspeccion={inspeccion}
                  inspectores={inspectores}
                  alAsignar={(mensaje) => {
                    setAsignando(null);
                    setAviso(mensaje);
                    void cargar();
                  }}
                  alCancelar={() => {
                    setAsignando(null);
                  }}
                />
              )}
              {!esJefatura && inspeccion.estado === 'ASIGNADA' && (
                <Link className="boton" to={`/personal/inspecciones/${inspeccion.id}/resultado`}>
                  Registrar resultado
                </Link>
              )}
            </article>
          ))}
      </main>
    </>
  );
}
