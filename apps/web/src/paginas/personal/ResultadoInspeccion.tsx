import { type ChangeEvent, type SyntheticEvent, useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  type Inspeccion,
  listarInspecciones,
  registrarResultadoInspeccion,
} from '../../servicios/clienteApi';
import { hoyLima } from './Inspecciones';

// Registro del resultado ITSE desde el celular (historia 2 de la 006): resultado, observaciones, de 1 a 5
// fotos con la cámara y, si es favorable, el certificado.

const MAXIMO_FOTOS = 5;

interface FotoElegida {
  readonly archivo: File;
  readonly vista: string;
}

/** Página `/personal/inspecciones/:id/resultado`. */
export function ResultadoInspeccion() {
  const { id = '' } = useParams();
  const ids = useId();
  const [inspeccion, setInspeccion] = useState<Inspeccion | null | undefined>(undefined);
  const [resultado, setResultado] = useState<'FAVORABLE' | 'DESFAVORABLE' | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [numeroCertificado, setNumeroCertificado] = useState('');
  const [certificadoEmitidoEn, setCertificadoEmitidoEn] = useState(hoyLima());
  const [fotos, setFotos] = useState<readonly FotoElegida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [registrada, setRegistrada] = useState(false);

  useEffect(() => {
    void listarInspecciones('ASIGNADA').then((lista) => {
      setInspeccion(lista.tipo === 'ok' ? (lista.datos.find((i) => i.id === id) ?? null) : null);
    });
  }, [id]);

  // Libera las vistas previas al salir.
  useEffect(
    () => () => {
      for (const foto of fotos) {
        URL.revokeObjectURL(foto.vista);
      }
    },
    [fotos],
  );

  const elegirFotos = (evento: ChangeEvent<HTMLInputElement>) => {
    const nuevas = [...(evento.target.files ?? [])];
    evento.target.value = '';
    if (fotos.length + nuevas.length > MAXIMO_FOTOS) {
      setError('Puedes adjuntar hasta 5 fotos.');
      return;
    }
    setError(null);
    setFotos([
      ...fotos,
      ...nuevas.map((archivo) => ({ archivo, vista: URL.createObjectURL(archivo) })),
    ]);
  };

  const quitar = (indice: number) => {
    setFotos(fotos.filter((_, i) => i !== indice));
  };

  const enviar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (resultado === null) {
      setError('Elige el resultado de la inspección.');
      return;
    }
    if (fotos.length === 0) {
      setError('Adjunta al menos una foto.');
      return;
    }
    if (resultado === 'DESFAVORABLE' && observaciones.trim() === '') {
      setError('Escribe las observaciones del resultado desfavorable.');
      return;
    }
    if (resultado === 'FAVORABLE' && numeroCertificado.trim() === '') {
      setError('Escribe el número del certificado ITSE.');
      return;
    }
    setError(null);
    setEnviando(true);
    const respuesta = await registrarResultadoInspeccion(id, {
      resultado,
      observaciones,
      numeroCertificado,
      certificadoEmitidoEn,
      fotos: fotos.map((foto) => foto.archivo),
    });
    setEnviando(false);
    switch (respuesta.tipo) {
      case 'ok':
        setRegistrada(true);
        return;
      case 'invalido':
        setError(respuesta.errores[0]?.mensaje ?? 'Revisa los datos.');
        return;
      case 'conflicto':
        setError(respuesta.mensaje);
        return;
      case 'demasiado-grande':
        setError('Una foto pesa más de 10 MB.');
        return;
      case 'sin-permiso':
        setError('Esta inspección no está asignada a tu usuario.');
        return;
      case 'no-encontrada':
        setError('La inspección no existe.');
        return;
      case 'no-disponible':
        setError('No se pudo registrar. Revisa tu conexión y vuelve a intentarlo.');
        return;
    }
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Resultado de la inspección</h1>
        {inspeccion && (
          <p className="cabecera__descripcion">
            {inspeccion.numeroExpediente}
            {inspeccion.direccion ? ` · ${inspeccion.direccion}` : ''}
          </p>
        )}
      </header>
      <main className="contenido">
        {inspeccion === null && !registrada && (
          <p className="aviso aviso--error" role="alert">
            No encontramos esta inspección entre las que tienes asignadas.
          </p>
        )}
        {registrada && (
          <section className="tarjeta">
            <p className="aviso aviso--info" role="status">
              Resultado registrado.
            </p>
            <Link className="boton" to="/personal/inspecciones">
              Volver a mis inspecciones
            </Link>
          </section>
        )}
        {inspeccion && !registrada && (
          <form
            className="tarjeta formulario"
            onSubmit={(evento) => void enviar(evento)}
            noValidate
          >
            {error && (
              <p className="aviso aviso--error" role="alert">
                {error}
              </p>
            )}
            <fieldset className="campo">
              <legend className="campo__etiqueta">Resultado</legend>
              {(['FAVORABLE', 'DESFAVORABLE'] as const).map((opcion) => (
                <label key={opcion} className="campo__opcion">
                  <input
                    type="radio"
                    name="resultado"
                    value={opcion}
                    checked={resultado === opcion}
                    onChange={() => {
                      setResultado(opcion);
                    }}
                  />{' '}
                  {opcion === 'FAVORABLE' ? 'Favorable' : 'Desfavorable'}
                </label>
              ))}
            </fieldset>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${ids}-obs`}>
                Observaciones
              </label>
              <textarea
                id={`${ids}-obs`}
                className="campo__entrada"
                rows={4}
                maxLength={4000}
                value={observaciones}
                onChange={(evento) => {
                  setObservaciones(evento.target.value);
                }}
              />
            </div>
            {resultado === 'FAVORABLE' && (
              <>
                <div className="campo">
                  <label className="campo__etiqueta" htmlFor={`${ids}-cert`}>
                    Número del certificado ITSE
                  </label>
                  <input
                    id={`${ids}-cert`}
                    className="campo__entrada"
                    autoComplete="off"
                    maxLength={30}
                    value={numeroCertificado}
                    onChange={(evento) => {
                      setNumeroCertificado(evento.target.value);
                    }}
                  />
                </div>
                <div className="campo">
                  <label className="campo__etiqueta" htmlFor={`${ids}-emision`}>
                    Fecha de emisión del certificado
                  </label>
                  <input
                    id={`${ids}-emision`}
                    className="campo__entrada"
                    type="date"
                    max={hoyLima()}
                    value={certificadoEmitidoEn}
                    onChange={(evento) => {
                      setCertificadoEmitidoEn(evento.target.value);
                    }}
                  />
                </div>
              </>
            )}
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${ids}-fotos`}>
                Fotos (de 1 a 5, JPG o PNG)
              </label>
              <input
                id={`${ids}-fotos`}
                className="campo__entrada"
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                multiple
                onChange={elegirFotos}
              />
            </div>
            {fotos.length > 0 && (
              <ul className="fotos" aria-label="Fotos elegidas">
                {fotos.map((foto, indice) => (
                  <li key={foto.vista}>
                    <img src={foto.vista} alt={`Foto ${String(indice + 1)}`} width={96} />
                    <button
                      type="button"
                      className="boton boton--claro"
                      onClick={() => {
                        quitar(indice);
                      }}
                    >
                      Quitar foto {indice + 1}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="formulario__acciones">
              <button type="submit" className="boton" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Registrar resultado'}
              </button>
              <Link className="boton boton--claro" to="/personal/inspecciones">
                Cancelar
              </Link>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
