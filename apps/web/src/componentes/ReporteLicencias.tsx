import { type SyntheticEvent, useEffect, useId, useState } from 'react';
import {
  descargarReporteCsv,
  type FilaReporte,
  type FiltroReporte,
  guardarArchivo,
  listarLicencias,
  type RecetaResumen,
  reporteLicencias,
  type SituacionReporte,
} from '../servicios/clienteApi';
import { CampoFormulario } from './CampoFormulario';
import { TablaAdaptable } from './TablaAdaptable';

// Reporte de licencias de la jefatura (RF18; historia 2 de la 007, contracts/portal-007.md). Solo
// muestra el titular público abreviado que manda el servidor.

const SITUACIONES: readonly { readonly valor: SituacionReporte; readonly texto: string }[] = [
  { valor: 'VIGENTES', texto: 'Vigentes' },
  { valor: 'EN_TRAMITE', texto: 'En trámite' },
  { valor: 'ITSE_POR_VENCER', texto: 'ITSE por vencer' },
];

const COLUMNA_FECHA: Readonly<Record<SituacionReporte, string>> = {
  VIGENTES: 'Emitida',
  EN_TRAMITE: 'Presentado',
  ITSE_POR_VENCER: 'Vence el ITSE',
};

type Carga =
  | { readonly tipo: 'inicial' }
  | { readonly tipo: 'cargando' }
  | {
      readonly tipo: 'lista';
      readonly filas: readonly FilaReporte[];
      readonly truncado: boolean;
      readonly situacion: SituacionReporte;
    }
  | { readonly tipo: 'error'; readonly mensaje: string };

const MENSAJE_ERROR = {
  'sin-permiso': 'Tu usuario no tiene permiso para ver el reporte.',
  'no-disponible': 'No se pudo obtener el reporte. Vuelve a intentarlo.',
} as const;

export function ReporteLicencias() {
  const id = useId();
  const [filtro, setFiltro] = useState<FiltroReporte>({ situacion: 'VIGENTES' });
  const [licencias, setLicencias] = useState<readonly RecetaResumen[]>([]);
  const [carga, setCarga] = useState<Carga>({ tipo: 'inicial' });
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    listarLicencias().then(setLicencias, () => {
      setLicencias([]);
    });
  }, []);

  const ver = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    setAviso(null);
    setCarga({ tipo: 'cargando' });
    const resultado = await reporteLicencias(filtro);
    setCarga(
      resultado.tipo === 'ok'
        ? {
            tipo: 'lista',
            filas: resultado.filas,
            truncado: resultado.truncado,
            situacion: filtro.situacion,
          }
        : { tipo: 'error', mensaje: MENSAJE_ERROR[resultado.tipo] },
    );
  };

  const descargar = async () => {
    setAviso(null);
    const resultado = await descargarReporteCsv(filtro);
    if (resultado.tipo === 'ok') {
      guardarArchivo(resultado.csv, resultado.nombre);
      return;
    }
    setAviso(MENSAJE_ERROR[resultado.tipo]);
  };

  return (
    <section className="tarjeta" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="ficha__nombre">
        Reporte de licencias
      </h2>
      <form className="formulario" onSubmit={(evento) => void ver(evento)} noValidate>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`${id}-situacion`}>
            Situación
          </label>
          <select
            id={`${id}-situacion`}
            className="campo__entrada"
            value={filtro.situacion}
            onChange={(evento) => {
              setFiltro({ ...filtro, situacion: evento.target.value as SituacionReporte });
            }}
          >
            {SITUACIONES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`${id}-licencia`}>
            Licencia
          </label>
          <select
            id={`${id}-licencia`}
            className="campo__entrada"
            value={filtro.codigoReceta ?? ''}
            onChange={(evento) => {
              setFiltro({ ...filtro, codigoReceta: evento.target.value });
            }}
          >
            <option value="">Todas</option>
            {licencias.map((licencia) => (
              <option key={licencia.codigo} value={licencia.codigo}>
                {licencia.codigo} – {licencia.nombre}
              </option>
            ))}
          </select>
        </div>
        <CampoFormulario
          etiqueta="Giro"
          maxLength={150}
          value={filtro.giro ?? ''}
          onChange={(evento) => {
            setFiltro({ ...filtro, giro: evento.target.value });
          }}
        />
        <CampoFormulario
          etiqueta="Zona"
          maxLength={150}
          value={filtro.zona ?? ''}
          onChange={(evento) => {
            setFiltro({ ...filtro, zona: evento.target.value });
          }}
        />
        <div className="formulario__acciones">
          <button type="submit" className="boton">
            Ver reporte
          </button>
          <button type="button" className="boton boton--claro" onClick={() => void descargar()}>
            Descargar CSV
          </button>
        </div>
      </form>

      {aviso && (
        <p className="aviso aviso--error" role="alert">
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
      {carga.tipo === 'lista' && carga.truncado && (
        <p className="aviso aviso--info" role="status">
          Se muestran las primeras 5,000 filas; ajusta los filtros.
        </p>
      )}
      {carga.tipo === 'lista' && carga.filas.length === 0 && (
        <p className="aviso">No hay licencias con esos filtros.</p>
      )}
      {carga.tipo === 'lista' && carga.filas.length > 0 && (
        <TablaAdaptable etiqueta="Resultado del reporte">
          <table className="table table-hover tabla">
            <thead>
              <tr>
                <th scope="col">Número</th>
                <th scope="col">Licencia</th>
                <th scope="col">Titular</th>
                <th scope="col">Giro</th>
                <th scope="col">Zona</th>
                <th scope="col">Estado</th>
                <th scope="col">{COLUMNA_FECHA[carga.situacion]}</th>
              </tr>
            </thead>
            <tbody>
              {carga.filas.map((fila) => (
                <tr key={fila.numero}>
                  <th scope="row">{fila.numero}</th>
                  <td>{fila.codigoReceta}</td>
                  <td>{fila.titular}</td>
                  <td>{fila.giro}</td>
                  <td>{fila.zona}</td>
                  <td>{fila.estado}</td>
                  <td>{fila.fecha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaAdaptable>
      )}
    </section>
  );
}
