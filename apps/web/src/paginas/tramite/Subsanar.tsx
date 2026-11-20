import { type SyntheticEvent, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import {
  consultarEstado,
  type EstadoPublico,
  subirDocumento,
  subsanarObservacion,
} from '../../servicios/clienteApi';
import { useTramite } from '../../tramite/ContextoTramite';

// Subsanar la observación en línea (historia 4 de la 005, contracts/portal-evaluacion-pago.md). El
// titular ya confirmó su identidad; aquí adjunta los documentos que faltaban. Nada va a la URL salvo
// el número de expediente, que no es dato personal.

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly estado: EstadoPublico }
  | { readonly tipo: 'error'; readonly mensaje: string };

const MENSAJE_SUBIDA: Record<string, string> = {
  'demasiado-grande': 'El archivo pesa más de lo permitido.',
  'tipo-no-permitido': 'Solo se aceptan PDF, JPG o PNG.',
  'no-autenticado': 'Tu confirmación de identidad venció. Vuelve a confirmarla.',
  'no-disponible': 'No se pudo subir el archivo. Vuelve a intentarlo.',
};

/** Página `/tramite/subsanar/:numero`. */
export function Subsanar() {
  const { numero = '' } = useParams();
  const { permiso } = useTramite();
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [subidos, setSubidos] = useState<Record<number, { nombre: string; documentoId: string }>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (permiso === null) {
      return;
    }
    let vigente = true;
    void consultarEstado(numero, permiso.identidad.numeroDocumento).then((resultado) => {
      if (!vigente) {
        return;
      }
      if (resultado.tipo !== 'ok') {
        setCarga({ tipo: 'error', mensaje: 'No pudimos leer tu expediente. Vuelve a intentarlo.' });
      } else if (resultado.estado.estado !== 'OBSERVADO') {
        setCarga({
          tipo: 'error',
          mensaje: 'Este expediente no tiene observaciones por subsanar.',
        });
      } else {
        setCarga({ tipo: 'lista', estado: resultado.estado });
      }
    });
    return () => {
      vigente = false;
    };
  }, [numero, permiso]);

  if (permiso === null) {
    return <Navigate to={`/tramite/identidad?subsanar=${encodeURIComponent(numero)}`} replace />;
  }

  const subir = async (requisitoId: number, archivo: File | undefined) => {
    if (archivo === undefined) {
      return;
    }
    setError(null);
    const resultado = await subirDocumento(permiso.token, archivo);
    if (resultado.tipo === 'ok') {
      setSubidos((actual) => ({
        ...actual,
        [requisitoId]: { nombre: archivo.name, documentoId: resultado.documentoId },
      }));
    } else {
      setError(MENSAJE_SUBIDA[resultado.tipo] ?? MENSAJE_SUBIDA['no-disponible'] ?? null);
    }
  };

  const enviar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const documentos = Object.entries(subidos).map(([requisitoId, subido]) => ({
      requisitoId: Number(requisitoId),
      documentoId: subido.documentoId,
    }));
    if (documentos.length === 0) {
      setError('Adjunta al menos un documento.');
      return;
    }
    setError(null);
    setEnviando(true);
    const resultado = await subsanarObservacion(
      permiso.token,
      numero,
      permiso.identidad,
      documentos,
    );
    setEnviando(false);
    switch (resultado.tipo) {
      case 'ok':
        setListo(true);
        return;
      case 'invalido':
        setError(resultado.errores[0]?.mensaje ?? 'Revisa los documentos adjuntos.');
        return;
      case 'no-autenticado':
        setError('Tu confirmación de identidad venció. Vuelve a confirmarla.');
        return;
      case 'sin-permiso':
        setError('Solo el titular del expediente puede subsanarlo.');
        return;
      case 'ya-no-observado':
        setError('Este expediente ya no está observado.');
        return;
      case 'no-disponible':
        setError('No se pudo enviar la subsanación. Vuelve a intentarlo.');
        return;
    }
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Subsanar la observación</h1>
        <p className="cabecera__descripcion">Expediente {numero}</p>
      </header>

      <main className="contenido tramite">
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}
        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando tu expediente…
          </p>
        )}
        {carga.tipo === 'error' && (
          <p className="aviso aviso--error" role="alert">
            {carga.mensaje}
          </p>
        )}
        {listo && (
          <section className="tarjeta">
            <p className="aviso aviso--info" role="status">
              Listo: tu expediente volvió a evaluación.
            </p>
          </section>
        )}
        {!listo && carga.tipo === 'lista' && (
          <form
            className="tarjeta formulario"
            onSubmit={(evento) => void enviar(evento)}
            noValidate
          >
            <h2 className="ficha__subtitulo">Observaciones</h2>
            <ul>
              {(carga.estado.observacionesPendientes ?? []).map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
            <h2 className="ficha__subtitulo">Documentos</h2>
            {(carga.estado.requisitosSubsanables ?? []).map((requisito) => (
              <div className="campo" key={requisito.id}>
                <label className="campo__etiqueta" htmlFor={`requisito-${String(requisito.id)}`}>
                  {requisito.descripcion}
                </label>
                <input
                  id={`requisito-${String(requisito.id)}`}
                  className="campo__entrada"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(evento) => void subir(requisito.id, evento.target.files?.[0])}
                />
                {subidos[requisito.id] && (
                  <p className="campo__ayuda">Adjuntado: {subidos[requisito.id]?.nombre}</p>
                )}
              </div>
            ))}
            <div className="formulario__acciones">
              <button type="submit" className="boton" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar subsanación'}
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
