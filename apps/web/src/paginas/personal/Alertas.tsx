import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { type AlertaPlazo, atenderAlerta, listarAlertas } from '../../servicios/clienteApi';
import { fechaCorta } from './Inspecciones';
import { InsigniaEstado } from '../../componentes/InsigniaEstado';

// Alertas de plazos para la jefatura (historia 4 de la 006): expedientes a los que les quedan 2 días
// hábiles o menos, de la más urgente a la menos urgente.

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly alertas: readonly AlertaPlazo[] }
  | { readonly tipo: 'error'; readonly mensaje: string };

/** "Vencido hace 2 días hábiles", "Vence hoy" o "Quedan 2 días hábiles". */
export const textoUrgencia = (dias: number): string => {
  if (dias < 0) {
    return `Vencido hace ${String(-dias)} ${dias === -1 ? 'día hábil' : 'días hábiles'}`;
  }
  if (dias === 0) {
    return 'Vence hoy';
  }
  return dias === 1 ? 'Queda 1 día hábil' : `Quedan ${String(dias)} días hábiles`;
};

/** Página `/personal/alertas`. */
export function Alertas() {
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const resultado = await listarAlertas();
    setCarga(
      resultado.tipo === 'ok'
        ? { tipo: 'lista', alertas: resultado.alertas }
        : {
            tipo: 'error',
            mensaje:
              resultado.tipo === 'sin-permiso'
                ? 'Tu usuario no tiene permiso para ver las alertas.'
                : 'No se pudieron cargar las alertas. Vuelve a intentarlo.',
          },
    );
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const atender = async (alerta: AlertaPlazo) => {
    const resultado = await atenderAlerta(alerta.id);
    setAviso(
      resultado === 'no-disponible'
        ? 'No se pudo marcar la alerta. Vuelve a intentarlo.'
        : `Alerta de ${alerta.numeroExpediente} marcada como atendida.`,
    );
    void cargar();
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Alertas de plazos</h1>
        <p className="cabecera__descripcion">
          Expedientes a los que les quedan 2 días hábiles o menos para cumplir el plazo del TUPA.
        </p>
      </header>
      <main className="contenido">
        {aviso && (
          <p className="aviso aviso--info" role="status">
            {aviso}
          </p>
        )}
        {carga.tipo === 'cargando' && <p className="aviso">Cargando…</p>}
        {carga.tipo === 'error' && (
          <p className="aviso aviso--error" role="alert">
            {carga.mensaje}
          </p>
        )}
        {carga.tipo === 'lista' && carga.alertas.length === 0 && (
          <p className="aviso">No hay alertas pendientes.</p>
        )}
        {carga.tipo === 'lista' &&
          carga.alertas.map((alerta) => (
            <article
              key={alerta.id}
              className="tarjeta"
              aria-label={`Alerta de ${alerta.numeroExpediente}`}
            >
              <h2 className="ficha__nombre">
                <Link to={`/personal/expedientes/${alerta.numeroExpediente}`}>
                  {alerta.numeroExpediente}
                </Link>
              </h2>
              <p
                className={`aviso ${alerta.diasHabilesRestantes < 0 ? 'aviso--error' : 'aviso--info'}`}
              >
                {textoUrgencia(alerta.diasHabilesRestantes)}
              </p>
              <dl className="ficha__datos">
                <div className="ficha__dato">
                  <dt>Vence</dt>
                  <dd>{fechaCorta(alerta.venceEn)}</dd>
                </div>
                <div className="ficha__dato">
                  <dt>Estado</dt>
                  <dd>
                    {alerta.estadoExpediente ? (
                      <InsigniaEstado estado={alerta.estadoExpediente} />
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="boton boton--claro"
                onClick={() => void atender(alerta)}
              >
                Marcar como atendida
              </button>
            </article>
          ))}
      </main>
    </>
  );
}
