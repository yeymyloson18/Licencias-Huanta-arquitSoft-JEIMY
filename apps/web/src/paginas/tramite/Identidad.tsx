import { type SyntheticEvent, useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import {
  type DesafioOtp,
  type ErrorCampo,
  type IdentidadSolicitud,
  listarLicencias,
  type RecetaResumen,
  type ResultadoCodigoIdentidad,
  type ResultadoVerificacionIdentidad,
  verificarCodigoIdentidad,
  verificarIdentidad,
} from '../../servicios/clienteApi';
import { useTramite } from '../../tramite/ContextoTramite';

// Confirmación de identidad en dos pasos (CU03 de la 004, contracts/portal-tramite.md). Nada de lo
// escrito va a la URL ni al almacenamiento del navegador.

const MENSAJE_NO_COINCIDE =
  'Los datos no coinciden con el servicio de identificación. Revísalos e inténtalo de nuevo.';
const MENSAJE_SERVICIO_CAIDO =
  'No pudimos verificar tu identidad en este momento. Puedes acudir a mesa de partes.';
const MENSAJE_NO_DISPONIBLE =
  'El servicio no está disponible en este momento. Inténtalo en unos minutos.';
const MENSAJE_CODIGO = 'El código es incorrecto o ya venció.';

const dosDigitos = (numero: number) => String(numero).padStart(2, '0');

const mensajeBloqueo = (hasta: Date) =>
  `Demasiados intentos. Puedes volver a intentarlo a las ${dosDigitos(hasta.getHours())}:${dosDigitos(hasta.getMinutes())}.`;

type FallaVerificacion = Exclude<
  ResultadoVerificacionIdentidad,
  { tipo: 'ok' } | { tipo: 'invalido' }
>;

const mensajeVerificacion = (resultado: FallaVerificacion): string => {
  switch (resultado.tipo) {
    case 'no-coincide':
      return MENSAJE_NO_COINCIDE;
    case 'bloqueado':
      return mensajeBloqueo(resultado.reintentarEn);
    case 'servicio-caido':
      return MENSAJE_SERVICIO_CAIDO;
    case 'no-disponible':
      return MENSAJE_NO_DISPONIBLE;
  }
};

const mensajeCodigo = (resultado: Exclude<ResultadoCodigoIdentidad, { tipo: 'ok' }>): string => {
  switch (resultado.tipo) {
    case 'codigo-incorrecto':
      return MENSAJE_CODIGO;
    case 'bloqueado':
      return mensajeBloqueo(resultado.reintentarEn);
    case 'no-disponible':
      return MENSAJE_NO_DISPONIBLE;
  }
};

type TipoDocumento = 'DNI' | 'CE';

interface DatosPersona {
  readonly tipoDocumento: TipoDocumento;
  readonly numeroDocumento: string;
  readonly fechaEmision: string;
}

const PERSONA_VACIA: DatosPersona = { tipoDocumento: 'DNI', numeroDocumento: '', fechaEmision: '' };

const aPersona = (datos: DatosPersona) => ({
  tipoDocumento: datos.tipoDocumento,
  numeroDocumento: datos.numeroDocumento.trim().toUpperCase(),
  ...(datos.tipoDocumento === 'DNI' ? { fechaEmision: datos.fechaEmision } : {}),
});

const dePersona = (persona: {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaEmision?: string | null;
}): DatosPersona => ({
  tipoDocumento: persona.tipoDocumento,
  numeroDocumento: persona.numeroDocumento,
  fechaEmision: persona.fechaEmision ?? '',
});

interface PropiedadesPersona {
  readonly prefijo: string;
  readonly titulo: string;
  readonly datos: DatosPersona;
  readonly errores: Readonly<Record<string, string>>;
  readonly alCambiar: (datos: DatosPersona) => void;
}

/** Tipo, número y fecha de emisión (solo DNI) del titular o del representante. */
function DatosDocumento({ prefijo, titulo, datos, errores, alCambiar }: PropiedadesPersona) {
  const idTipo = useId();
  return (
    <fieldset className="formulario__seccion">
      <legend>{titulo}</legend>
      <div className="campo">
        <label className="campo__etiqueta" htmlFor={idTipo}>
          Tipo de documento
        </label>
        <select
          id={idTipo}
          className="campo__entrada"
          value={datos.tipoDocumento}
          onChange={(evento) => {
            alCambiar({ ...datos, tipoDocumento: evento.target.value as TipoDocumento });
          }}
        >
          <option value="DNI">DNI</option>
          <option value="CE">Carné de extranjería</option>
        </select>
      </div>
      <CampoFormulario
        etiqueta="Número de documento"
        inputMode={datos.tipoDocumento === 'DNI' ? 'numeric' : 'text'}
        autoComplete="off"
        required
        value={datos.numeroDocumento}
        error={errores[`${prefijo}numeroDocumento`]}
        onChange={(evento) => {
          alCambiar({ ...datos, numeroDocumento: evento.target.value });
        }}
      />
      {datos.tipoDocumento === 'DNI' && (
        <CampoFormulario
          etiqueta="Fecha de emisión del DNI"
          type="date"
          required
          value={datos.fechaEmision}
          error={errores[`${prefijo}fechaEmision`]}
          onChange={(evento) => {
            alCambiar({ ...datos, fechaEmision: evento.target.value });
          }}
        />
      )}
    </fieldset>
  );
}

const porCampo = (errores: readonly ErrorCampo[]): Record<string, string> =>
  Object.fromEntries(errores.map((error) => [error.campo, error.mensaje]));

type EstadoLicencias =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error' }
  | { readonly tipo: 'lista'; readonly licencias: RecetaResumen[] };

/** Página `/tramite/identidad?licencia=<código>`. */
export function Identidad() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const tramite = useTramite();
  const idSelector = useId();
  const titulo = useRef<HTMLHeadingElement>(null);

  const anterior = tramite.identidad;
  const [titular, setTitular] = useState<DatosPersona>(
    anterior ? dePersona(anterior) : PERSONA_VACIA,
  );
  const [ruc, setRuc] = useState(anterior?.ruc ?? '');
  const [celular, setCelular] = useState(anterior?.celular ?? '');
  const [conRepresentante, setConRepresentante] = useState(Boolean(anterior?.representante));
  const [representante, setRepresentante] = useState<DatosPersona>(
    anterior?.representante ? dePersona(anterior.representante) : PERSONA_VACIA,
  );

  const [licencias, setLicencias] = useState<EstadoLicencias>({ tipo: 'cargando' });
  const [licencia, setLicencia] = useState(parametros.get('licencia') ?? '');
  const [desafio, setDesafio] = useState<DesafioOtp | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;
    listarLicencias()
      .then((todas) => {
        if (vigente) {
          setLicencias({ tipo: 'lista', licencias: todas.filter((r) => r.tipo === 'LICENCIA') });
        }
      })
      .catch(() => {
        if (vigente) {
          setLicencias({ tipo: 'error' });
        }
      });
    return () => {
      vigente = false;
    };
  }, []);

  // El foco va al título de cada paso, para que el lector de pantalla anuncie el cambio.
  useEffect(() => {
    titulo.current?.focus();
  }, [desafio]);

  const elegida =
    licencias.tipo === 'lista' ? licencias.licencias.find((r) => r.codigo === licencia) : undefined;
  const codigoInicial = parametros.get('licencia');
  const inicialValida =
    licencias.tipo === 'lista' && licencias.licencias.some((r) => r.codigo === codigoInicial);

  const identidadEscrita = (): IdentidadSolicitud => ({
    ...aPersona(titular),
    ruc: ruc.trim(),
    celular: celular.trim(),
    ...(conRepresentante ? { representante: aPersona(representante) } : {}),
  });

  const pedirCodigo = async (identidad: IdentidadSolicitud, reenvio: boolean) => {
    setEnviando(true);
    setError(null);
    setAviso(null);
    const resultado = await verificarIdentidad(identidad);
    setEnviando(false);
    if (resultado.tipo === 'ok') {
      tramite.recordarIdentidad(identidad);
      setDesafio(resultado.datos);
      setCodigo('');
      setErrores({});
      if (reenvio) {
        setAviso(`Te enviamos otro código al celular ${resultado.datos.celularEnmascarado}.`);
      }
    } else if (resultado.tipo === 'invalido') {
      setErrores(porCampo(resultado.errores));
      setError('Revisa los datos marcados.');
    } else {
      setError(mensajeVerificacion(resultado));
    }
  };

  const alEnviarDatos = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (elegida === undefined) {
      setErrores({ licencia: 'Elige la licencia que solicitas' });
      setError('Revisa los datos marcados.');
      return;
    }
    void pedirCodigo(identidadEscrita(), false);
  };

  const reenviar = () => {
    if (tramite.identidad !== null) {
      void pedirCodigo(tramite.identidad, true);
    }
  };

  const alEnviarCodigo = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (desafio === null) {
      return;
    }
    setEnviando(true);
    setError(null);
    setAviso(null);
    const resultado = await verificarCodigoIdentidad(desafio.desafioId, codigo.trim());
    setEnviando(false);
    if (resultado.tipo === 'ok') {
      setCodigo('');
      tramite.confirmar(resultado.token, resultado.expiraEn);
      void navegar(`/tramite/solicitud?licencia=${encodeURIComponent(licencia)}`);
    } else {
      setError(mensajeCodigo(resultado));
    }
  };

  const volver = () => {
    setDesafio(null);
    setCodigo('');
    setError(null);
    setAviso(null);
  };

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Presentar solicitud de licencia</h1>
        <p className="cabecera__descripcion">
          Primero confirmamos tu identidad con un código que enviamos a tu celular.
        </p>
      </header>

      <main className="contenido tramite">
        <section className="tarjeta formulario">
          <h2 className="tramite__paso" ref={titulo} tabIndex={-1}>
            {desafio === null ? 'Paso 1 de 2: tus datos' : 'Paso 2 de 2: código de verificación'}
          </h2>

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

          {desafio === null ? (
            <form onSubmit={alEnviarDatos} noValidate>
              {licencias.tipo === 'cargando' && (
                <p className="aviso" role="status">
                  Cargando las licencias…
                </p>
              )}
              {licencias.tipo === 'error' && (
                <p className="aviso aviso--error" role="alert">
                  {MENSAJE_NO_DISPONIBLE}
                </p>
              )}
              {licencias.tipo === 'lista' &&
                (inicialValida && elegida ? (
                  <p className="tramite__licencia">
                    Licencia: <strong>{elegida.nombre}</strong>
                  </p>
                ) : (
                  <div className="campo">
                    <label className="campo__etiqueta" htmlFor={idSelector}>
                      Licencia que solicitas
                    </label>
                    <select
                      id={idSelector}
                      className="campo__entrada"
                      value={licencia}
                      aria-invalid={errores.licencia ? true : undefined}
                      aria-describedby={errores.licencia ? `${idSelector}-error` : undefined}
                      onChange={(evento) => {
                        setLicencia(evento.target.value);
                      }}
                    >
                      <option value="">Elige una licencia</option>
                      {licencias.licencias.map((receta) => (
                        <option key={receta.codigo} value={receta.codigo}>
                          {receta.nombre}
                        </option>
                      ))}
                    </select>
                    {errores.licencia && (
                      <p className="campo__error" id={`${idSelector}-error`}>
                        {errores.licencia}
                      </p>
                    )}
                  </div>
                ))}

              <DatosDocumento
                prefijo=""
                titulo="Titular"
                datos={titular}
                errores={errores}
                alCambiar={setTitular}
              />
              <CampoFormulario
                etiqueta="RUC"
                inputMode="numeric"
                autoComplete="off"
                required
                value={ruc}
                error={errores.ruc}
                onChange={(evento) => {
                  setRuc(evento.target.value);
                }}
              />
              <CampoFormulario
                etiqueta="Celular"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                required
                ayuda="Te enviaremos aquí el código de verificación."
                value={celular}
                error={errores.celular}
                onChange={(evento) => {
                  setCelular(evento.target.value);
                }}
              />

              <label className="casilla">
                <input
                  type="checkbox"
                  checked={conRepresentante}
                  onChange={(evento) => {
                    setConRepresentante(evento.target.checked);
                  }}
                />
                Actúo como representante legal o apoderado
              </label>
              {conRepresentante && (
                <DatosDocumento
                  prefijo="representante."
                  titulo="Representante"
                  datos={representante}
                  errores={errores}
                  alCambiar={setRepresentante}
                />
              )}

              <div className="formulario__acciones">
                <button type="submit" className="boton" disabled={enviando}>
                  {enviando ? 'Verificando…' : 'Enviar código'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={(evento) => void alEnviarCodigo(evento)} noValidate>
              <p>
                Escribe el código de 6 dígitos que enviamos al celular {desafio.celularEnmascarado}.
              </p>
              <CampoFormulario
                etiqueta="Código de verificación"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={codigo}
                onChange={(evento) => {
                  setCodigo(evento.target.value);
                }}
              />
              <div className="formulario__acciones">
                <button type="submit" className="boton" disabled={enviando}>
                  {enviando ? 'Verificando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  className="boton boton--secundario"
                  disabled={enviando}
                  onClick={reenviar}
                >
                  Enviar otro código
                </button>
                <button type="button" className="boton boton--claro" onClick={volver}>
                  Corregir mis datos
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </>
  );
}
