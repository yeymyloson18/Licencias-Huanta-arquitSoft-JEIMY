import { type SyntheticEvent, useCallback, useEffect, useId, useState } from 'react';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import {
  eliminarFeriado,
  type Feriado,
  listarFeriados,
  registrarFeriado,
} from '../../servicios/clienteApi';
import { fechaCorta } from '../personal/Inspecciones';

// Feriados del año (historia 3 de la 006, contracts/portal-006.md): el administrador los registra y
// los elimina; con ellos se cuentan los plazos en días hábiles.

const ALCANCES: Record<Feriado['alcance'], string> = {
  NACIONAL: 'Nacional',
  REGIONAL: 'Regional',
  LOCAL: 'Local',
};

const anioActual = () =>
  Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric' }).format(
      new Date(),
    ),
  );

/** Página `/admin/feriados`. */
export function Feriados() {
  const idAnio = useId();
  const idAlcance = useId();
  const [anio, setAnio] = useState(anioActual);
  const [feriados, setFeriados] = useState<readonly Feriado[] | null | undefined>(undefined);
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [alcance, setAlcance] = useState<Feriado['alcance']>('NACIONAL');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setFeriados(undefined);
    setFeriados(await listarFeriados(anio));
  }, [anio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const registrar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    setError(null);
    setAviso(null);
    if (fecha === '' || descripcion.trim() === '') {
      setError('Escribe la fecha y la descripción del feriado.');
      return;
    }
    setEnviando(true);
    const resultado = await registrarFeriado({ fecha, descripcion: descripcion.trim(), alcance });
    setEnviando(false);
    switch (resultado.tipo) {
      case 'ok':
        setAviso(`Feriado del ${fechaCorta(fecha)} registrado.`);
        setFecha('');
        setDescripcion('');
        void cargar();
        return;
      case 'invalido':
        setError(resultado.mensaje);
        return;
      case 'repetido':
        setError('Ya hay un feriado registrado en esa fecha.');
        return;
      default:
        setError('No se pudo registrar el feriado. Vuelve a intentarlo.');
    }
  };

  const eliminar = async (fechaFeriado: string) => {
    setPorEliminar(null);
    setError(null);
    const resultado = await eliminarFeriado(fechaFeriado);
    if (resultado.tipo === 'ok' || resultado.tipo === 'no-encontrado') {
      setAviso(`Feriado del ${fechaCorta(fechaFeriado)} eliminado.`);
      void cargar();
      return;
    }
    setError('No se pudo eliminar el feriado. Vuelve a intentarlo.');
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Feriados</h1>
        <p className="cabecera__descripcion">
          Los plazos del TUPA se cuentan en días hábiles: sin sábados, domingos ni estos feriados.
        </p>
      </header>
      <main className="contenido">
        <div className="campo">
          <label className="campo__etiqueta" htmlFor={idAnio}>
            Año
          </label>
          <select
            id={idAnio}
            className="campo__entrada"
            value={anio}
            onChange={(evento) => {
              setAnio(Number(evento.target.value));
            }}
          >
            {[anioActual() - 1, anioActual(), anioActual() + 1].map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}
        {aviso && (
          <p className="aviso aviso--info" role="status">
            {aviso}
          </p>
        )}

        <section className="tarjeta" aria-label={`Feriados de ${String(anio)}`}>
          <h2 className="ficha__subtitulo">Feriados de {anio}</h2>
          {feriados === undefined && <p>Cargando…</p>}
          {feriados === null && <p className="aviso aviso--error">No se pudieron cargar.</p>}
          {feriados && feriados.length === 0 && <p>No hay feriados registrados en {anio}.</p>}
          {feriados && feriados.length > 0 && (
            <ul className="lista-feriados">
              {feriados.map((feriado) => (
                <li key={feriado.fecha}>
                  <strong>{fechaCorta(feriado.fecha)}</strong> — {feriado.descripcion} (
                  {ALCANCES[feriado.alcance]})
                  {porEliminar === feriado.fecha ? (
                    <span>
                      {' '}
                      ¿Eliminar?{' '}
                      <button
                        type="button"
                        className="boton boton--claro"
                        onClick={() => void eliminar(feriado.fecha)}
                      >
                        Sí, eliminar
                      </button>{' '}
                      <button
                        type="button"
                        className="boton boton--claro"
                        onClick={() => {
                          setPorEliminar(null);
                        }}
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="boton boton--claro"
                        aria-label={`Eliminar el feriado del ${fechaCorta(feriado.fecha)}`}
                        onClick={() => {
                          setPorEliminar(feriado.fecha);
                        }}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form
          className="tarjeta formulario"
          onSubmit={(evento) => void registrar(evento)}
          noValidate
        >
          <h2 className="ficha__subtitulo">Registrar feriado</h2>
          <CampoFormulario
            etiqueta="Fecha"
            type="date"
            value={fecha}
            onChange={(evento) => {
              setFecha(evento.target.value);
            }}
          />
          <CampoFormulario
            etiqueta="Descripción"
            maxLength={150}
            value={descripcion}
            onChange={(evento) => {
              setDescripcion(evento.target.value);
            }}
          />
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={idAlcance}>
              Alcance
            </label>
            <select
              id={idAlcance}
              className="campo__entrada"
              value={alcance}
              onChange={(evento) => {
                setAlcance(evento.target.value as Feriado['alcance']);
              }}
            >
              {Object.entries(ALCANCES).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </div>
          <div className="formulario__acciones">
            <button type="submit" className="boton" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Registrar feriado'}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
