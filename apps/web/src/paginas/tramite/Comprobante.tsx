import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { ExpedienteRegistrado } from '../../servicios/clienteApi';
import { conPuntoFinal } from '../../componentes/formato';
import { useTramite } from '../../tramite/ContextoTramite';
import { InsigniaEstado } from '../../componentes/InsigniaEstado';

// Comprobante de la presentación (CU04 de la 004, contracts/portal-tramite.md). Los datos llegan en
// el estado de la navegación (memoria); al recargar solo queda el número de la URL.

const formatearFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(iso));

/** Página `/tramite/comprobante/:numero`. */
export function Comprobante() {
  const { numero = '' } = useParams();
  const ubicacion = useLocation();
  const expediente = (ubicacion.state as { expediente?: ExpedienteRegistrado } | null)?.expediente;
  const datos = expediente?.numero === numero ? expediente : undefined;
  const { terminar } = useTramite();

  // El trámite terminó: se borra de la memoria lo escrito, la identidad y el permiso ya usado.
  useEffect(() => {
    terminar();
  }, [terminar]);

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Solicitud presentada</h1>
        <p className="cabecera__descripcion">
          Guarda o imprime este comprobante: con el número puedes consultar tu trámite.
        </p>
      </header>

      <main className="contenido comprobante">
        <section className="tarjeta">
          <p className="comprobante__etiqueta">Número de expediente</p>
          <p className="comprobante__numero">{numero}</p>

          {datos ? (
            <dl className="ficha__datos">
              <div className="ficha__dato">
                <dt>Licencia</dt>
                <dd>{datos.nombreLicencia}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Ruta</dt>
                <dd>{datos.ruta}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Estado</dt>
                <dd>
                  <InsigniaEstado estado={datos.estado} />
                </dd>
              </div>
              <div className="ficha__dato">
                <dt>Presentada el</dt>
                <dd>{formatearFecha(datos.presentadoEn)}</dd>
              </div>
            </dl>
          ) : (
            <p>Tu solicitud quedó registrada con este número.</p>
          )}

          <h2 className="ficha__subtitulo">Qué sigue</h2>
          <p>
            {conPuntoFinal(
              datos?.siguientePaso ??
                'La municipalidad revisará tu solicitud. Puedes consultar su estado con el número de expediente.',
            )}
          </p>

          <div className="formulario__acciones comprobante__acciones">
            <button
              type="button"
              className="boton"
              onClick={() => {
                window.print();
              }}
            >
              Imprimir
            </button>
            <Link className="boton boton--claro" to="/">
              Volver al inicio
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
