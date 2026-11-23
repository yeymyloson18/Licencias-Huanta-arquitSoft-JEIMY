import { type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import { formatearTasa } from '../../componentes/formato';
import { GraficoBarras } from '../../componentes/GraficoBarras';
import { ReporteLicencias } from '../../componentes/ReporteLicencias';
import { obtenerTablero, type Tablero as DatosTablero } from '../../servicios/clienteApi';
import { ESTADOS } from './Expedientes';

// Tablero de la jefatura (HU10, RF19; historia 1 de la 007, contracts/portal-007.md).

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly tablero: DatosTablero }
  | { readonly tipo: 'error'; readonly mensaje: string };

/** "2.5 días" o "Sin datos". */
export const textoPromedio = (promedio: number | null): string =>
  promedio === null ? 'Sin datos' : `${promedio.toLocaleString('es-PE')} días`;

/** "66.7 %", "No aplica" (plazo 0) o "Sin datos". */
export const textoDentroDelPlazo = (
  porcentaje: number | null,
  plazo: number,
  atendidos: number,
): string => {
  if (atendidos === 0) {
    return 'Sin datos';
  }
  return porcentaje === null || plazo === 0
    ? 'No aplica'
    : `${porcentaje.toLocaleString('es-PE')} %`;
};

const nombreEstado = (estado: string): string =>
  (ESTADOS as Readonly<Record<string, string | undefined>>)[estado] ?? estado;

/** Página `/personal/tablero` (rol JEFATURA). */
export function Tablero() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });

  const cargar = useCallback(async (rango: { desde: string; hasta: string } | null) => {
    setCarga({ tipo: 'cargando' });
    const resultado = await obtenerTablero(rango);
    switch (resultado.tipo) {
      case 'ok':
        setErrores({});
        setDesde(resultado.tablero.desde);
        setHasta(resultado.tablero.hasta);
        setCarga({ tipo: 'lista', tablero: resultado.tablero });
        return;
      case 'invalido':
        setErrores(Object.fromEntries(resultado.errores.map((e) => [e.campo, e.mensaje])));
        setCarga({ tipo: 'error', mensaje: 'Revisa las fechas del rango.' });
        return;
      case 'sin-permiso':
        setCarga({ tipo: 'error', mensaje: 'Tu usuario no tiene permiso para ver el tablero.' });
        return;
      case 'no-disponible':
        setCarga({ tipo: 'error', mensaje: 'No se pudo cargar el tablero. Vuelve a intentarlo.' });
    }
  }, []);

  useEffect(() => {
    void cargar(null);
  }, [cargar]);

  const verTablero = (evento: SyntheticEvent) => {
    evento.preventDefault();
    void cargar({ desde, hasta });
  };

  const tablero = carga.tipo === 'lista' ? carga.tablero : null;
  const estados = tablero
    ? Object.entries(tablero.expedientesPorEstado)
        .filter(([, cantidad]) => cantidad > 0)
        .sort(([, a], [, b]) => b - a)
    : [];
  const totalExpedientes = estados.reduce((suma, [, cantidad]) => suma + cantidad, 0);
  const conAtencion = tablero ? tablero.tiempoPromedioPorReceta.filter((t) => t.atendidos > 0) : [];

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Tablero</h1>
        <p className="cabecera__descripcion">
          Expedientes por estado, tiempo de atención frente al plazo del TUPA e ingresos en caja.
        </p>
      </header>
      <main className="contenido">
        <form className="tarjeta formulario" onSubmit={verTablero} noValidate>
          <CampoFormulario
            etiqueta="Desde"
            type="date"
            value={desde}
            error={errores['desde'] ?? null}
            onChange={(evento) => {
              setDesde(evento.target.value);
            }}
          />
          <CampoFormulario
            etiqueta="Hasta"
            type="date"
            value={hasta}
            error={errores['hasta'] ?? null}
            onChange={(evento) => {
              setHasta(evento.target.value);
            }}
          />
          <div className="formulario__acciones">
            <button type="submit" className="boton">
              Ver tablero
            </button>
          </div>
        </form>

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

        {tablero && (
          <>
            {totalExpedientes === 0 &&
              tablero.ingresos.total === '0.00' &&
              conAtencion.length === 0 && <p className="aviso">No hay datos en este rango.</p>}
            <section className="tarjeta" aria-labelledby="titulo-estados">
              <h2 id="titulo-estados" className="ficha__nombre">
                Expedientes por estado
              </h2>
              <p>
                {totalExpedientes}{' '}
                {totalExpedientes === 1 ? 'expediente presentado' : 'expedientes presentados'} en el
                rango.
              </p>
              <GraficoBarras
                titulo="Expedientes por estado"
                columnas={['Estado', 'Cantidad']}
                barras={estados.map(([estado, cantidad]) => ({
                  etiqueta: nombreEstado(estado),
                  valor: cantidad,
                }))}
              />
            </section>

            <section className="tarjeta" aria-labelledby="titulo-tiempos">
              <h2 id="titulo-tiempos" className="ficha__nombre">
                Tiempo de atención frente al plazo del TUPA
              </h2>
              <GraficoBarras
                titulo="Promedio de días hábiles de atención por licencia"
                columnas={['Licencia', 'Promedio']}
                leyendaMarca="La línea vertical marca el plazo del TUPA."
                barras={conAtencion.map((t) => ({
                  etiqueta: t.codigoReceta,
                  valor: t.promedioDiasHabiles ?? 0,
                  texto: textoPromedio(t.promedioDiasHabiles),
                  ...(t.plazoTupaDias > 0 ? { marca: t.plazoTupaDias } : {}),
                }))}
              />
              <div
                className="grafico__tabla"
                role="region"
                aria-label="Detalle por licencia"
                tabIndex={0}
              >
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Licencia</th>
                      <th scope="col">Plazo TUPA</th>
                      <th scope="col">Atendidos</th>
                      <th scope="col">Promedio (días hábiles)</th>
                      <th scope="col">Dentro del plazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablero.tiempoPromedioPorReceta.map((t) => (
                      <tr key={t.codigoReceta}>
                        <th scope="row">{t.codigoReceta}</th>
                        <td>
                          {t.plazoTupaDias === 0 ? 'No aplica' : `${String(t.plazoTupaDias)} días`}
                        </td>
                        <td>{t.atendidos}</td>
                        <td>{textoPromedio(t.promedioDiasHabiles)}</td>
                        <td>
                          {textoDentroDelPlazo(t.dentroDelPlazo, t.plazoTupaDias, t.atendidos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="tarjeta" aria-labelledby="titulo-ingresos">
              <h2 id="titulo-ingresos" className="ficha__nombre">
                Ingresos en caja
              </h2>
              <p className="tablero__total">
                Total: <strong>{formatearTasa(tablero.ingresos.total)}</strong>
              </p>
              <GraficoBarras
                titulo="Ingresos por licencia"
                columnas={['Licencia', 'Monto']}
                barras={Object.entries(tablero.ingresos.porReceta).map(([codigo, monto]) => ({
                  etiqueta: codigo,
                  valor: Number(monto),
                  texto: formatearTasa(monto),
                }))}
              />
            </section>
          </>
        )}

        <ReporteLicencias />
      </main>
    </>
  );
}
