import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CampoFormulario } from '../componentes/CampoFormulario';
import { DescargarEsquela } from '../componentes/DescargarEsquela';
import { conPuntoFinal, formatearTasaFicha } from '../componentes/formato';
import { consultarEstado, type EstadoPublico } from '../servicios/clienteApi';

// Consulta pública del estado (CU05 de la 004, contracts/portal-tramite.md). El número y el documento
// van en el cuerpo de un POST y solo viven en el estado de esta página: nada queda en la URL.

const MENSAJE_NO_COINCIDE =
  'No encontramos un trámite con esos datos. Revisa el número de expediente y el documento.';
const MENSAJE_NO_DISPONIBLE =
  'La consulta no está disponible en este momento. Inténtalo en unos minutos.';

const dosDigitos = (numero: number) => String(numero).padStart(2, '0');

const formatearFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(iso));

/** Página `/consulta`. */
export function Consulta() {
  const [numero, setNumero] = useState('');
  const [documento, setDocumento] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoPublico | null>(null);
  const [enviando, setEnviando] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);

  // El foco va al resultado para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (estado !== null) {
      titulo.current?.focus();
    }
  }, [estado]);

  const alEnviar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const faltantes: Record<string, string> = {};
    if (numero.trim() === '') {
      faltantes.numeroExpediente = 'Escribe el número de expediente';
    }
    if (documento.trim() === '') {
      faltantes.documento = 'Escribe tu DNI, carné de extranjería o RUC';
    }
    setErrores(faltantes);
    setError(null);
    setEstado(null);
    if (Object.keys(faltantes).length > 0) {
      return;
    }
    setEnviando(true);
    const resultado = await consultarEstado(numero, documento);
    setEnviando(false);
    switch (resultado.tipo) {
      case 'ok':
        setEstado(resultado.estado);
        return;
      case 'invalido':
        setErrores(
          Object.fromEntries(resultado.errores.map((falla) => [falla.campo, falla.mensaje])),
        );
        return;
      case 'no-encontrado':
        setError(MENSAJE_NO_COINCIDE);
        return;
      case 'bloqueado':
        setError(
          `Demasiados intentos. Puedes volver a intentarlo a las ${dosDigitos(resultado.reintentarEn.getHours())}:${dosDigitos(resultado.reintentarEn.getMinutes())}.`,
        );
        return;
      case 'no-disponible':
        setError(MENSAJE_NO_DISPONIBLE);
        return;
    }
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Consultar mi trámite</h1>
        <p className="cabecera__descripcion">
          Escribe el número de expediente y el DNI, carné de extranjería o RUC del titular.
        </p>
      </header>

      <main className="contenido consulta">
        <section className="tarjeta">
          <form
            className="formulario"
            method="post"
            onSubmit={(evento) => void alEnviar(evento)}
            noValidate
          >
            {error && (
              <p className="aviso aviso--error" role="alert">
                {error}
              </p>
            )}
            <CampoFormulario
              etiqueta="Número de expediente"
              autoComplete="off"
              ayuda="Por ejemplo, EXP-2026-000123."
              required
              value={numero}
              error={errores.numeroExpediente}
              onChange={(evento) => {
                setNumero(evento.target.value);
              }}
            />
            <CampoFormulario
              etiqueta="DNI, carné de extranjería o RUC del titular"
              autoComplete="off"
              required
              value={documento}
              error={errores.documento}
              onChange={(evento) => {
                setDocumento(evento.target.value);
              }}
            />
            <div className="formulario__acciones">
              <button type="submit" className="boton" disabled={enviando}>
                {enviando ? 'Consultando…' : 'Consultar'}
              </button>
            </div>
          </form>
        </section>

        {estado && (
          <section className="tarjeta consulta__resultado" aria-labelledby="titulo-resultado">
            <h2 id="titulo-resultado" className="ficha__nombre" ref={titulo} tabIndex={-1}>
              {estado.numero}
            </h2>
            <dl className="ficha__datos">
              <div className="ficha__dato">
                <dt>Estado</dt>
                <dd>{estado.descripcionEstado}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Licencia</dt>
                <dd>{estado.nombreLicencia}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Presentada el</dt>
                <dd>{formatearFecha(estado.presentadoEn)}</dd>
              </div>
            </dl>
            {estado.siguientePaso && (
              <>
                <h3 className="ficha__subtitulo">Qué sigue</h3>
                <p>{conPuntoFinal(estado.siguientePaso)}</p>
              </>
            )}
            {estado.observacionesPendientes && estado.observacionesPendientes.length > 0 && (
              <>
                <h3 className="ficha__subtitulo">Observaciones por subsanar</h3>
                <ul>
                  {estado.observacionesPendientes.map((texto) => (
                    <li key={texto}>{texto}</li>
                  ))}
                </ul>
                {estado.estado === 'OBSERVADO' && (
                  <Link
                    className="boton"
                    to={`/tramite/identidad?subsanar=${encodeURIComponent(estado.numero)}`}
                  >
                    Subsanar
                  </Link>
                )}
              </>
            )}
            {estado.codigoEsquela && (
              <>
                <h3 className="ficha__subtitulo">Esquela de pago</h3>
                <dl className="ficha__datos">
                  <div className="ficha__dato">
                    <dt>Código</dt>
                    <dd>{estado.codigoEsquela}</dd>
                  </div>
                  {estado.montoEsquela && (
                    <div className="ficha__dato">
                      <dt>Monto</dt>
                      <dd>{formatearTasaFicha(estado.montoEsquela)}</dd>
                    </div>
                  )}
                  <div className="ficha__dato">
                    <dt>Pago</dt>
                    <dd>{estado.esquelaPagada ? 'Pagada' : 'Pendiente'}</dd>
                  </div>
                </dl>
              </>
            )}
            {estado.tokenConsulta && (
              <DescargarEsquela
                codigo={estado.codigoEsquela ?? `ESQ-${estado.numero}`}
                tokenConsulta={estado.tokenConsulta.token}
              />
            )}
            <h3 className="ficha__subtitulo">Historial</h3>
            <ol className="consulta__historial">
              {estado.historial.map((registro) => (
                <li key={`${registro.estado}-${registro.ocurridoEn}`}>
                  {registro.descripcion} ({formatearFecha(registro.ocurridoEn)})
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </>
  );
}
