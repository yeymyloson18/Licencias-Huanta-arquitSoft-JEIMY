import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  type EstadoExpediente,
  type ExpedienteResumen,
  listarExpedientes,
  type PaginaExpedientes,
} from '../../servicios/clienteApi';

// Bandeja del personal (historia 4 de la 004, contracts/portal-tramite.md): todos los expedientes,
// tarjetas en el celular y tabla en pantallas anchas. Los filtros van en la URL (no son datos
// personales) para poder volver a la misma vista.

export const ESTADOS: Readonly<Record<EstadoExpediente, string>> = {
  REGISTRADO: 'Registrado',
  OBSERVADO: 'Observado',
  EN_EVALUACION: 'En evaluación',
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGADO: 'Pagado',
  EN_INSPECCION: 'En inspección',
  APROBADO: 'Aprobado',
  LICENCIA_PROVISIONAL: 'Licencia provisional',
  LICENCIA_EMITIDA: 'Licencia emitida',
  ITSE_POSTERIOR_PENDIENTE: 'ITSE posterior pendiente',
  FINALIZADO: 'Finalizado',
  DENEGADO: 'Denegado',
  DERIVADO_A_FISCALIZACION: 'Derivado a fiscalización',
};

const POR_PAGINA = 20;

export const formatearFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(
    new Date(iso),
  );

const esEstado = (valor: string | null): valor is EstadoExpediente =>
  valor !== null && valor in ESTADOS;
const esRuta = (valor: string | null): valor is 'A' | 'B' | 'C' =>
  valor === 'A' || valor === 'B' || valor === 'C';

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error'; readonly mensaje: string }
  | { readonly tipo: 'lista'; readonly pagina: PaginaExpedientes };

const licenciaDe = (fila: ExpedienteResumen) => fila.nombreLicencia ?? fila.codigoReceta;

/** Página `/personal/expedientes`. */
export function Expedientes() {
  const [parametros, setParametros] = useSearchParams();
  const idEstado = useId();
  const idRuta = useId();
  const estadoUrl = parametros.get('estado');
  const rutaUrl = parametros.get('ruta');
  const estado = esEstado(estadoUrl) ? estadoUrl : undefined;
  const ruta = esRuta(rutaUrl) ? rutaUrl : undefined;
  const pagina = Math.max(1, Number.parseInt(parametros.get('pagina') ?? '1', 10) || 1);
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [estadoElegido, setEstadoElegido] = useState(estado ?? '');
  const [rutaElegida, setRutaElegida] = useState(ruta ?? '');

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    const resultado = await listarExpedientes({ estado, ruta, pagina, porPagina: POR_PAGINA });
    if (resultado.tipo === 'ok') {
      setCarga({ tipo: 'lista', pagina: resultado.datos });
    } else {
      setCarga({
        tipo: 'error',
        mensaje:
          resultado.tipo === 'sin-permiso'
            ? 'No tienes permiso para ver la bandeja.'
            : 'La bandeja no se pudo cargar. Vuelve a intentarlo en unos minutos.',
      });
    }
  }, [estado, ruta, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrar = () => {
    const siguientes = new URLSearchParams();
    if (estadoElegido !== '') siguientes.set('estado', estadoElegido);
    if (rutaElegida !== '') siguientes.set('ruta', rutaElegida);
    setParametros(siguientes);
  };

  const irAPagina = (numero: number) => {
    const siguientes = new URLSearchParams(parametros);
    siguientes.set('pagina', String(numero));
    setParametros(siguientes);
  };

  const totalPaginas =
    carga.tipo === 'lista'
      ? Math.max(1, Math.ceil(carga.pagina.total / carga.pagina.porPagina))
      : 1;

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Expedientes</h1>
        <p className="cabecera__descripcion">
          Todos los expedientes, del más reciente al más antiguo.
        </p>
      </header>

      <main className="contenido bandeja">
        {/* Sin <form>: react-router navega en una transición y React 19 intentaría armar un FormData del
            envío; dos listas desplegables no necesitan "Enter para enviar". */}
        <div className="bandeja__filtros" role="search" aria-label="Filtros de la bandeja">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={idEstado}>
              Estado
            </label>
            <select
              id={idEstado}
              className="campo__entrada"
              value={estadoElegido}
              onChange={(evento) => {
                setEstadoElegido(evento.target.value);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={idRuta}>
              Ruta
            </label>
            <select
              id={idRuta}
              className="campo__entrada"
              value={rutaElegida}
              onChange={(evento) => {
                setRutaElegida(evento.target.value);
              }}
            >
              <option value="">Todas</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
          <button type="button" className="boton" onClick={filtrar}>
            Filtrar
          </button>
        </div>

        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando expedientes…
          </p>
        )}
        {carga.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>{carga.mensaje}</p>
            <button type="button" className="boton" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}
        {carga.tipo === 'lista' && carga.pagina.datos.length === 0 && (
          <p className="aviso">No hay expedientes con estos filtros.</p>
        )}
        {carga.tipo === 'lista' && carga.pagina.datos.length > 0 && (
          <>
            <p role="status">
              {carga.pagina.total === 1
                ? '1 expediente'
                : `${String(carga.pagina.total)} expedientes`}
            </p>

            <ul className="bandeja__tarjetas" aria-label="Expedientes">
              {carga.pagina.datos.map((fila) => (
                <li key={fila.numero} className="tarjeta">
                  <Link className="bandeja__numero" to={`/personal/expedientes/${fila.numero}`}>
                    {fila.numero}
                  </Link>
                  <p>{licenciaDe(fila)}</p>
                  <p>
                    {ESTADOS[fila.estado]} · Ruta {fila.ruta} · {formatearFecha(fila.presentadoEn)}
                  </p>
                  <p>
                    {fila.nombreTitular}
                    {fila.giro ? ` · ${fila.giro}` : ''}
                  </p>
                </li>
              ))}
            </ul>

            <table className="bandeja__tabla">
              <caption className="solo-lectores">Expedientes</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Licencia</th>
                  <th scope="col">Ruta</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Titular</th>
                  <th scope="col">Giro</th>
                  <th scope="col">Presentado</th>
                </tr>
              </thead>
              <tbody>
                {carga.pagina.datos.map((fila) => (
                  <tr key={fila.numero}>
                    <th scope="row">
                      <Link to={`/personal/expedientes/${fila.numero}`}>{fila.numero}</Link>
                    </th>
                    <td>{licenciaDe(fila)}</td>
                    <td>{fila.ruta}</td>
                    <td>{ESTADOS[fila.estado]}</td>
                    <td>{fila.nombreTitular}</td>
                    <td>{fila.giro}</td>
                    <td>{formatearFecha(fila.presentadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <nav className="paginacion" aria-label="Páginas">
              <button
                type="button"
                className="boton boton--secundario"
                disabled={pagina <= 1}
                onClick={() => {
                  irAPagina(pagina - 1);
                }}
              >
                Anterior
              </button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <button
                type="button"
                className="boton boton--secundario"
                disabled={pagina >= totalPaginas}
                onClick={() => {
                  irAPagina(pagina + 1);
                }}
              >
                Siguiente
              </button>
            </nav>
          </>
        )}
      </main>
    </>
  );
}
