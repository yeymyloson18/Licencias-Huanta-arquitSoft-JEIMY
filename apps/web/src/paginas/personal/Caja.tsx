import { type SyntheticEvent, useState } from 'react';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import { formatearTasaFicha } from '../../componentes/formato';
import {
  consultarEsquela,
  type Esquela,
  obtenerTitularParaCaja,
  registrarPago,
} from '../../servicios/clienteApi';
import { ESTADOS } from './Expedientes';

// Caja (historia 2 de la 005, contracts/portal-evaluacion-pago.md): buscar la esquela por su código,
// ver el expediente, el titular, la licencia y el monto, confirmar y registrar el recibo.

interface Encontrada {
  readonly esquela: Esquela;
  readonly titular: string | null;
}

type Paso =
  | { readonly tipo: 'buscar' }
  | { readonly tipo: 'confirmar'; readonly datos: Encontrada }
  | { readonly tipo: 'registrado'; readonly esquela: Esquela; readonly titular: string | null };

/** Página `/personal/caja`. */
export function Caja() {
  const [codigo, setCodigo] = useState('');
  const [recibo, setRecibo] = useState('');
  const [paso, setPaso] = useState<Paso>({ tipo: 'buscar' });
  const [error, setError] = useState<string | null>(null);
  const [errorRecibo, setErrorRecibo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const buscar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    setError(null);
    if (codigo.trim() === '') {
      setError('Escribe el código de la esquela.');
      return;
    }
    setEnviando(true);
    const resultado = await consultarEsquela(codigo);
    if (resultado.tipo !== 'ok') {
      setEnviando(false);
      setError(
        resultado.tipo === 'no-encontrada'
          ? 'No hay una esquela con ese código.'
          : resultado.tipo === 'sin-permiso'
            ? 'Tu usuario no tiene permiso para registrar pagos.'
            : 'No se pudo buscar la esquela. Vuelve a intentarlo.',
      );
      return;
    }
    const titular = await obtenerTitularParaCaja(resultado.esquela.numeroExpediente);
    setEnviando(false);
    setRecibo('');
    setErrorRecibo(null);
    setPaso({
      tipo: 'confirmar',
      datos: { esquela: resultado.esquela, titular: titular?.nombreTitular ?? null },
    });
  };

  const pagar = async (evento: SyntheticEvent, datos: Encontrada) => {
    evento.preventDefault();
    setError(null);
    setErrorRecibo(null);
    if (recibo.trim() === '') {
      setErrorRecibo('Escribe el número de recibo.');
      return;
    }
    setEnviando(true);
    const resultado = await registrarPago(datos.esquela.codigo, recibo);
    setEnviando(false);
    switch (resultado.tipo) {
      case 'ok':
        setPaso({ tipo: 'registrado', esquela: resultado.esquela, titular: datos.titular });
        return;
      case 'ya-pagada':
        setError('Esta esquela ya fue pagada.');
        return;
      case 'recibo-repetido':
        setErrorRecibo('Ese número de recibo ya está registrado en otra esquela.');
        return;
      case 'invalido':
        setErrorRecibo(resultado.mensaje);
        return;
      case 'no-corresponde':
        setError(resultado.mensaje);
        return;
      case 'sin-permiso':
        setError('Tu usuario no tiene permiso para registrar pagos.');
        return;
      case 'no-disponible':
        setError('No se pudo registrar el pago. Vuelve a intentarlo.');
        return;
    }
  };

  const nuevo = () => {
    setCodigo('');
    setRecibo('');
    setError(null);
    setPaso({ tipo: 'buscar' });
  };

  const datosEsquela = (esquela: Esquela, titular: string | null) => (
    <dl className="ficha__datos">
      {[
        ['Expediente', esquela.numeroExpediente],
        ['Titular', titular ?? '—'],
        ['Licencia', esquela.nombreLicencia ?? esquela.concepto],
        ['Monto', formatearTasaFicha(esquela.monto)],
        [
          'Estado del expediente',
          esquela.estadoExpediente ? ESTADOS[esquela.estadoExpediente] : '—',
        ],
      ].map(([etiqueta, valor]) => (
        <div key={etiqueta} className="ficha__dato">
          <dt>{etiqueta}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Caja</h1>
        <p className="cabecera__descripcion">
          Registra el pago de una esquela con su número de recibo.
        </p>
      </header>

      <main className="contenido">
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}

        {paso.tipo === 'buscar' && (
          <form
            className="tarjeta formulario"
            onSubmit={(evento) => void buscar(evento)}
            noValidate
          >
            <CampoFormulario
              etiqueta="Código de la esquela"
              ayuda="Por ejemplo, ESQ-EXP-2026-000123."
              autoComplete="off"
              value={codigo}
              onChange={(evento) => {
                setCodigo(evento.target.value);
              }}
            />
            <div className="formulario__acciones">
              <button type="submit" className="boton" disabled={enviando}>
                {enviando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
          </form>
        )}

        {paso.tipo === 'confirmar' && (
          <section className="tarjeta" aria-label={`Esquela ${paso.datos.esquela.codigo}`}>
            <h2 className="ficha__nombre">{paso.datos.esquela.codigo}</h2>
            {datosEsquela(paso.datos.esquela, paso.datos.titular)}
            {paso.datos.esquela.pagada ? (
              <p className="aviso aviso--error">
                Esta esquela ya fue pagada con el recibo {paso.datos.esquela.numeroRecibo}.
              </p>
            ) : (
              <form
                className="formulario"
                onSubmit={(evento) => void pagar(evento, paso.datos)}
                noValidate
              >
                <CampoFormulario
                  etiqueta="Número de recibo"
                  autoComplete="off"
                  value={recibo}
                  error={errorRecibo}
                  onChange={(evento) => {
                    setRecibo(evento.target.value);
                  }}
                />
                <p>
                  Vas a registrar {formatearTasaFicha(paso.datos.esquela.monto)} de{' '}
                  {paso.datos.titular ?? 'el titular'}. Revisa los datos antes de confirmar.
                </p>
                <div className="formulario__acciones">
                  <button type="submit" className="boton" disabled={enviando}>
                    {enviando ? 'Registrando…' : 'Registrar pago'}
                  </button>
                  <button type="button" className="boton boton--claro" onClick={nuevo}>
                    Buscar otra esquela
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {paso.tipo === 'registrado' && (
          <section className="tarjeta" aria-label="Pago registrado">
            <p className="aviso aviso--info" role="status">
              Pago registrado con el recibo {paso.esquela.numeroRecibo}.
            </p>
            {datosEsquela(paso.esquela, paso.titular)}
            <div className="formulario__acciones">
              <button type="button" className="boton" onClick={nuevo}>
                Registrar otro pago
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
