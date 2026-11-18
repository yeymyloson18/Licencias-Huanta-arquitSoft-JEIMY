import { type SyntheticEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import { formatearCalificacion } from '../../componentes/formato';
import {
  actualizarReceta,
  type ErrorCampo,
  obtenerRecetaAdmin,
  type RecetaAdmin,
  type RecetaEditable,
} from '../../servicios/clienteApi';

// Edición de una receta por el administrador (historia 3 de la 003, contracts/portal-catalogo.md).
// La pantalla ofrece solo combinaciones válidas para la ruta, pero la API valida igual (FR-019).

type Calificacion = RecetaAdmin['calificacion'];
type OrdenItse = NonNullable<RecetaAdmin['ordenItse']>;
type Condicion = RecetaAdmin['requisitos'][number]['condicion'];

interface RequisitoFormulario {
  /** Clave estable para React; no se envía. */
  readonly clave: string;
  readonly id?: number;
  readonly descripcion: string;
  readonly obligatorio: boolean;
  readonly condicion: Condicion;
}

interface FormularioReceta {
  readonly tasa: string;
  readonly plazoDias: string;
  readonly calificacion: Calificacion;
  /** '' = sin orden del ITSE. */
  readonly ordenItse: OrdenItse | '';
  readonly plazoItseDias: string;
  /** '' = vigencia indeterminada. */
  readonly vigenciaMeses: string;
  readonly requisitos: readonly RequisitoFormulario[];
}

/** Lo que la pantalla ofrece según la ruta (data-model.md §2 de la 003, `COHERENCIA_POR_RUTA`). */
interface OpcionesRuta {
  readonly calificaciones: readonly Calificacion[];
  readonly ordenesItse: readonly OrdenItse[];
  readonly conPlazoItse: boolean;
  readonly conVigencia: boolean;
}

const OPCIONES_POR_CLASE: Readonly<Record<'A' | 'B' | 'C' | 'TRAMITE', OpcionesRuta>> = {
  A: {
    calificaciones: ['APROBACION_AUTOMATICA'],
    ordenesItse: ['POSTERIOR'],
    conPlazoItse: true,
    conVigencia: true,
  },
  B: {
    calificaciones: ['EVALUACION_PREVIA_SILENCIO_POSITIVO'],
    ordenesItse: ['PREVIA'],
    conPlazoItse: true,
    conVigencia: true,
  },
  C: {
    calificaciones: ['APROBACION_AUTOMATICA'],
    ordenesItse: ['DENTRO_6_MESES'],
    conPlazoItse: false,
    conVigencia: true,
  },
  TRAMITE: {
    calificaciones: ['APROBACION_AUTOMATICA', 'SERVICIO_EXCLUSIVO'],
    ordenesItse: [],
    conPlazoItse: false,
    conVigencia: false,
  },
};

const opcionesDe = (receta: RecetaAdmin): OpcionesRuta =>
  OPCIONES_POR_CLASE[receta.tipo === 'TRAMITE_CONECTADO' ? 'TRAMITE' : (receta.ruta ?? 'A')];

const TEXTO_ORDEN_ITSE: Readonly<Record<OrdenItse, string>> = {
  POSTERIOR: 'Posterior a la licencia',
  PREVIA: 'Previa a la licencia',
  DENTRO_6_MESES: 'Dentro de los 6 meses',
};

const TEXTO_CONDICION: Readonly<Record<Condicion, string>> = {
  SIEMPRE: 'Siempre',
  CON_REPRESENTANTE: 'Solo si actúa un representante',
  GIRO_ESPECIAL: 'Solo si el giro lo exige',
  SIN_PLANOS_VIGENTES: 'Solo si no hay planos de los últimos 5 años',
};

const CONDICIONES = Object.keys(TEXTO_CONDICION) as Condicion[];

const TEXTO_TIPO: Readonly<Record<RecetaAdmin['tipo'], string>> = {
  LICENCIA: 'Licencia',
  TRAMITE_CONECTADO: 'Trámite conectado',
};

const ETIQUETAS: Readonly<Record<string, string>> = {
  cuerpo: 'Cambios',
  tasa: 'Tasa',
  plazoDias: 'Plazo',
  calificacion: 'Calificación',
  ordenItse: 'Orden del ITSE',
  plazoItseDias: 'Plazo del ITSE',
  vigenciaMeses: 'Vigencia',
  requisitos: 'Requisitos',
};

const MENSAJE_GUARDADO =
  'Cambios guardados. El catálogo público se actualiza en 5 minutos como máximo.';
const MENSAJE_ENTERO = 'Escribe un número entero mayor o igual a 1';

/** Etiqueta legible de un campo del 422, también para `requisitos[2].descripcion`. */
const etiquetaDe = (campo: string): string => {
  const requisito = /^requisitos\[(\d+)\]\.(\w+)$/.exec(campo);
  if (requisito) {
    const parte = requisito[2] === 'descripcion' ? 'descripción' : (requisito[2] ?? '');
    return `Requisito ${String(Number(requisito[1]) + 1)} (${parte})`;
  }
  return ETIQUETAS[campo] ?? campo;
};

let contadorClaves = 0;
const nuevaClave = (): string => {
  contadorClaves += 1;
  return `r${String(contadorClaves)}`;
};

const aTexto = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '' : String(valor);

const desdeReceta = (receta: RecetaAdmin): FormularioReceta => ({
  tasa: receta.tasa,
  plazoDias: aTexto(receta.plazoDias),
  calificacion: receta.calificacion,
  ordenItse: receta.ordenItse ?? '',
  plazoItseDias: aTexto(receta.plazoItseDias),
  vigenciaMeses: aTexto(receta.vigenciaMeses),
  requisitos: receta.requisitos.map((requisito) => ({
    clave: nuevaClave(),
    id: requisito.id,
    descripcion: requisito.descripcion,
    obligatorio: requisito.obligatorio,
    condicion: requisito.condicion,
  })),
});

/**
 * "180" → "180.00", "180.5" → "180.50" (el contrato `Soles` exige 2 decimales). Devuelve `null` si
 * no es un monto con 2 decimales como máximo.
 */
const normalizarTasa = (texto: string): string | null => {
  const coincidencia = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto.trim());
  if (!coincidencia) {
    return null;
  }
  const soles = (coincidencia[1] ?? '0').replace(/^0+(?=\d)/, '');
  return `${soles}.${(coincidencia[2] ?? '').padEnd(2, '0')}`;
};

/** '' → null; "12" → 12; otro texto → 'invalido'. */
const leerEntero = (texto: string): number | null | 'invalido' => {
  const limpio = texto.trim();
  if (limpio === '') {
    return null;
  }
  return /^\d+$/.test(limpio) && Number(limpio) >= 1 ? Number(limpio) : 'invalido';
};

type Comparacion =
  | { readonly tipo: 'errores'; readonly errores: ErrorCampo[] }
  | { readonly tipo: 'sin-cambios' }
  | { readonly tipo: 'cambios'; readonly cambios: RecetaEditable };

/** Compara el formulario con lo guardado y arma solo los campos que cambiaron. */
const compararConGuardado = (receta: RecetaAdmin, formulario: FormularioReceta): Comparacion => {
  const opciones = opcionesDe(receta);
  const errores: ErrorCampo[] = [];
  const cambios: RecetaEditable = {};

  const tasa = normalizarTasa(formulario.tasa);
  if (tasa === null) {
    errores.push({
      campo: 'tasa',
      mensaje: 'Escribe un monto en soles con 2 decimales como máximo, por ejemplo 180.50',
    });
  } else if (tasa !== receta.tasa) {
    cambios.tasa = tasa;
  }

  const plazo = leerEntero(formulario.plazoDias);
  if (plazo === 'invalido') {
    errores.push({ campo: 'plazoDias', mensaje: MENSAJE_ENTERO });
  } else if (plazo === null) {
    if (receta.plazoDias !== null) {
      errores.push({ campo: 'plazoDias', mensaje: 'Indica el plazo en días' });
    }
  } else if (plazo !== receta.plazoDias) {
    cambios.plazoDias = plazo;
  }

  if (formulario.calificacion !== receta.calificacion) {
    cambios.calificacion = formulario.calificacion;
  }

  if (receta.tipo === 'LICENCIA') {
    const ordenItse = formulario.ordenItse === '' ? null : formulario.ordenItse;
    if (ordenItse !== receta.ordenItse) {
      cambios.ordenItse = ordenItse;
    }
  }

  const enteros = [
    ['plazoItseDias', opciones.conPlazoItse, formulario.plazoItseDias, receta.plazoItseDias],
    ['vigenciaMeses', opciones.conVigencia, formulario.vigenciaMeses, receta.vigenciaMeses],
  ] as const;
  for (const [campo, visible, texto, guardado] of enteros) {
    if (!visible) continue;
    const valor = leerEntero(texto);
    if (valor === 'invalido') {
      errores.push({ campo, mensaje: MENSAJE_ENTERO });
    } else if (valor !== (guardado ?? null)) {
      cambios[campo] = valor;
    }
  }

  const requisitos = formulario.requisitos.map((requisito) => ({
    ...(requisito.id === undefined ? {} : { id: requisito.id }),
    descripcion: requisito.descripcion.trim(),
    obligatorio: requisito.obligatorio,
    condicion: requisito.condicion,
  }));
  const iguales =
    requisitos.length === receta.requisitos.length &&
    requisitos.every((requisito, indice) => {
      const guardado = receta.requisitos[indice];
      return (
        guardado !== undefined &&
        requisito.id === guardado.id &&
        requisito.descripcion === guardado.descripcion &&
        requisito.obligatorio === guardado.obligatorio &&
        requisito.condicion === guardado.condicion
      );
    });
  if (!iguales) {
    cambios.requisitos = requisitos;
  }

  if (errores.length > 0) {
    return { tipo: 'errores', errores };
  }
  return Object.keys(cambios).length === 0 ? { tipo: 'sin-cambios' } : { tipo: 'cambios', cambios };
};

// Borrador para no perder lo escrito si la sesión vence al guardar (401). Vive solo en esta pestaña
// (sessionStorage) y no contiene datos personales; si el navegador no lo permite, se sigue sin él.
const claveBorrador = (codigo: string) => `catalogo:borrador:${codigo}`;

const guardarBorrador = (codigo: string, formulario: FormularioReceta): void => {
  try {
    sessionStorage.setItem(claveBorrador(codigo), JSON.stringify(formulario));
  } catch {
    // Sin almacenamiento disponible.
  }
};

const borrarBorrador = (codigo: string): void => {
  try {
    sessionStorage.removeItem(claveBorrador(codigo));
  } catch {
    // Sin almacenamiento disponible.
  }
};

const tomarBorrador = (codigo: string): FormularioReceta | null => {
  try {
    const texto = sessionStorage.getItem(claveBorrador(codigo));
    sessionStorage.removeItem(claveBorrador(codigo));
    if (texto === null) {
      return null;
    }
    const borrador = JSON.parse(texto) as FormularioReceta;
    return Array.isArray(borrador.requisitos) ? borrador : null;
  } catch {
    return null;
  }
};

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly receta: RecetaAdmin }
  | { readonly tipo: 'no-encontrada' }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'error' };

type Aviso =
  | { readonly tipo: 'exito' | 'info'; readonly texto: string }
  | { readonly tipo: 'error'; readonly texto: string }
  | null;

/** Formulario de edición de una receta (solo ADMINISTRADOR). */
export function EditarReceta() {
  const { codigo = '' } = useParams();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const idBase = useId();
  const resumen = useRef<HTMLDivElement>(null);
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [formulario, setFormulario] = useState<FormularioReceta | null>(null);
  const [errores, setErrores] = useState<readonly ErrorCampo[]>([]);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    const resultado = await obtenerRecetaAdmin(codigo);
    switch (resultado.tipo) {
      case 'ok': {
        const borrador = tomarBorrador(codigo);
        setCarga({ tipo: 'lista', receta: resultado.datos });
        setFormulario(borrador ?? desdeReceta(resultado.datos));
        if (borrador) {
          setAviso({
            tipo: 'info',
            texto: 'Recuperamos los cambios que no se guardaron. Revísalos y vuelve a guardar.',
          });
        }
        break;
      }
      case 'no-encontrado':
        setCarga({ tipo: 'no-encontrada' });
        break;
      case 'sin-permiso':
        setCarga({ tipo: 'sin-permiso' });
        break;
      default:
        setCarga({ tipo: 'error' });
    }
  }, [codigo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El resumen de errores recibe el foco para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (errores.length > 0) {
      resumen.current?.focus();
    }
  }, [errores]);

  if (carga.tipo !== 'lista' || formulario === null) {
    return (
      <main className="contenido editar-receta">
        <h1>Editar receta {codigo}</h1>
        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando la receta…
          </p>
        )}
        {carga.tipo === 'no-encontrada' && <p className="aviso">Esta receta no existe.</p>}
        {carga.tipo === 'sin-permiso' && (
          <p className="aviso aviso--error" role="alert">
            No tienes permiso para gestionar el catálogo.
          </p>
        )}
        {carga.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>La receta no se pudo cargar. Vuelve a intentarlo en unos minutos.</p>
            <button type="button" className="boton" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}
        <p>
          <Link to="/admin/catalogo">Volver al catálogo</Link>
        </p>
      </main>
    );
  }

  const receta = carga.receta;
  const opciones = opcionesDe(receta);
  const errorDe = (campo: string): string | null =>
    errores.find((error) => error.campo === campo)?.mensaje ?? null;
  const idError = (campo: string) => `${idBase}-error-${campo.replace(/[^\w]/g, '-')}`;

  const cambiar = (cambios: Partial<FormularioReceta>) => {
    setFormulario({ ...formulario, ...cambios });
  };
  const cambiarRequisito = (indice: number, cambios: Partial<RequisitoFormulario>) => {
    cambiar({
      requisitos: formulario.requisitos.map((requisito, posicion) =>
        posicion === indice ? { ...requisito, ...cambios } : requisito,
      ),
    });
  };
  const moverRequisito = (indice: number, destino: number) => {
    const lista = [...formulario.requisitos];
    const [movido] = lista.splice(indice, 1);
    if (movido) {
      lista.splice(destino, 0, movido);
      cambiar({ requisitos: lista });
    }
  };
  const quitarRequisito = (indice: number) => {
    cambiar({ requisitos: formulario.requisitos.filter((_, posicion) => posicion !== indice) });
  };
  const agregarRequisito = () => {
    cambiar({
      requisitos: [
        ...formulario.requisitos,
        { clave: nuevaClave(), descripcion: '', obligatorio: true, condicion: 'SIEMPRE' },
      ],
    });
  };

  const guardar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    setAviso(null);
    const comparacion = compararConGuardado(receta, formulario);
    if (comparacion.tipo === 'errores') {
      setErrores(comparacion.errores);
      return;
    }
    setErrores([]);
    if (comparacion.tipo === 'sin-cambios') {
      setAviso({ tipo: 'info', texto: 'No hay cambios para guardar.' });
      return;
    }

    setGuardando(true);
    // Antes de llamar: si la sesión vence, la pantalla de ingreso puede aparecer de inmediato.
    guardarBorrador(codigo, formulario);
    const resultado = await actualizarReceta(codigo, comparacion.cambios);
    setGuardando(false);

    if (resultado.tipo === 'no-autenticado') {
      void navegar('/ingresar', {
        state: {
          volverA: ubicacion.pathname,
          aviso: 'Tu sesión terminó. Ingresa de nuevo: conservamos los cambios que escribiste.',
        },
      });
      return;
    }
    borrarBorrador(codigo);

    switch (resultado.tipo) {
      case 'ok':
        setCarga({ tipo: 'lista', receta: resultado.datos });
        setFormulario(desdeReceta(resultado.datos));
        setAviso({ tipo: 'exito', texto: MENSAJE_GUARDADO });
        break;
      case 'invalido':
        setErrores(resultado.errores);
        break;
      case 'sin-permiso':
        setAviso({ tipo: 'error', texto: 'No tienes permiso para editar el catálogo.' });
        break;
      case 'no-encontrado':
        setAviso({ tipo: 'error', texto: 'Esta receta ya no existe.' });
        break;
      default:
        setAviso({
          tipo: 'error',
          texto: 'No se pudieron guardar los cambios. Vuelve a intentarlo en unos minutos.',
        });
    }
  };

  const errorRequisitos = errorDe('requisitos');

  return (
    <main className="contenido editar-receta">
      <h1>Editar receta {receta.codigo}</h1>
      <p>
        <Link to="/admin/catalogo">Volver al catálogo</Link>
      </p>

      <dl className="editar-receta__fijos" aria-label="Datos que no se editan">
        <div>
          <dt>Código</dt>
          <dd>{receta.codigo}</dd>
        </div>
        <div>
          <dt>Nombre</dt>
          <dd>{receta.nombre}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{TEXTO_TIPO[receta.tipo]}</dd>
        </div>
        {receta.ruta !== null && (
          <div>
            <dt>Ruta</dt>
            <dd>{receta.ruta}</dd>
          </div>
        )}
        <div>
          <dt>Código del TUPA</dt>
          <dd>
            {receta.codigoTupa} (pág. {receta.paginaTupa})
          </dd>
        </div>
      </dl>

      {errores.length > 0 && (
        <div
          ref={resumen}
          className="aviso aviso--error editar-receta__resumen"
          role="alert"
          tabIndex={-1}
        >
          <h2>Revisa los datos marcados</h2>
          <ul>
            {errores.map((error) => (
              <li key={`${error.campo}-${error.mensaje}`}>
                {etiquetaDe(error.campo)}: {error.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aviso && (
        <p
          className={`aviso ${aviso.tipo === 'error' ? 'aviso--error' : 'aviso--info'}`}
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
        >
          {aviso.texto}
        </p>
      )}

      <form onSubmit={(evento) => void guardar(evento)} noValidate>
        <CampoFormulario
          etiqueta="Tasa (S/)"
          inputMode="decimal"
          value={formulario.tasa}
          error={errorDe('tasa')}
          ayuda="Monto en soles, por ejemplo 177.10. Escribe 0.00 si es gratuito."
          onChange={(evento) => {
            cambiar({ tasa: evento.target.value });
          }}
        />
        <CampoFormulario
          etiqueta="Plazo (días hábiles)"
          inputMode="numeric"
          value={formulario.plazoDias}
          error={errorDe('plazoDias')}
          onChange={(evento) => {
            cambiar({ plazoDias: evento.target.value });
          }}
        />

        <CampoSeleccion
          etiqueta="Calificación"
          valor={formulario.calificacion}
          error={errorDe('calificacion')}
          opciones={opciones.calificaciones.map((valor) => ({
            valor,
            texto: formatearCalificacion(valor),
          }))}
          alCambiar={(valor) => {
            cambiar({ calificacion: valor as Calificacion });
          }}
        />

        {receta.tipo === 'LICENCIA' && (
          <CampoSeleccion
            etiqueta="Orden del ITSE"
            valor={formulario.ordenItse}
            error={errorDe('ordenItse')}
            opciones={opciones.ordenesItse.map((valor) => ({
              valor,
              texto: TEXTO_ORDEN_ITSE[valor],
            }))}
            alCambiar={(valor) => {
              cambiar({ ordenItse: valor as OrdenItse });
            }}
          />
        )}

        {opciones.conPlazoItse && (
          <CampoFormulario
            etiqueta="Plazo del ITSE (días hábiles)"
            inputMode="numeric"
            value={formulario.plazoItseDias}
            error={errorDe('plazoItseDias')}
            onChange={(evento) => {
              cambiar({ plazoItseDias: evento.target.value });
            }}
          />
        )}

        {opciones.conVigencia && (
          <CampoFormulario
            etiqueta="Vigencia (meses)"
            inputMode="numeric"
            value={formulario.vigenciaMeses}
            error={errorDe('vigenciaMeses')}
            ayuda="Déjalo vacío si la vigencia es indeterminada."
            onChange={(evento) => {
              cambiar({ vigenciaMeses: evento.target.value });
            }}
          />
        )}

        <fieldset
          className="editar-receta__requisitos"
          aria-describedby={errorRequisitos ? idError('requisitos') : undefined}
        >
          <legend>Requisitos</legend>
          {errorRequisitos && (
            <p className="campo__error" id={idError('requisitos')}>
              {errorRequisitos}
            </p>
          )}
          <ol className="editar-receta__lista">
            {formulario.requisitos.map((requisito, indice) => {
              const numero = indice + 1;
              const campoDescripcion = `requisitos[${String(indice)}].descripcion`;
              const errorRequisito =
                errorDe(campoDescripcion) ??
                errorDe(`requisitos[${String(indice)}].id`) ??
                errorDe(`requisitos[${String(indice)}].condicion`);
              const idDescripcion = `${idBase}-req-${requisito.clave}`;
              const idCondicion = `${idDescripcion}-condicion`;
              const idObligatorio = `${idDescripcion}-obligatorio`;
              return (
                <li key={requisito.clave} className="editar-receta__requisito">
                  <label className="campo__etiqueta" htmlFor={idDescripcion}>
                    Requisito {numero}
                  </label>
                  <textarea
                    id={idDescripcion}
                    className="campo__entrada"
                    rows={2}
                    maxLength={500}
                    value={requisito.descripcion}
                    aria-invalid={errorRequisito ? true : undefined}
                    aria-describedby={errorRequisito ? idError(campoDescripcion) : undefined}
                    onChange={(evento) => {
                      cambiarRequisito(indice, { descripcion: evento.target.value });
                    }}
                  />
                  {errorRequisito && (
                    <p className="campo__error" id={idError(campoDescripcion)}>
                      {errorRequisito}
                    </p>
                  )}
                  <div className="editar-receta__opciones-requisito">
                    <label htmlFor={idCondicion}>Condición del requisito {numero}</label>
                    <select
                      id={idCondicion}
                      className="campo__entrada"
                      value={requisito.condicion}
                      onChange={(evento) => {
                        cambiarRequisito(indice, {
                          condicion: evento.target.value as Condicion,
                        });
                      }}
                    >
                      {CONDICIONES.map((condicion) => (
                        <option key={condicion} value={condicion}>
                          {TEXTO_CONDICION[condicion]}
                        </option>
                      ))}
                    </select>
                    <label className="editar-receta__casilla" htmlFor={idObligatorio}>
                      <input
                        id={idObligatorio}
                        type="checkbox"
                        checked={requisito.obligatorio}
                        onChange={(evento) => {
                          cambiarRequisito(indice, { obligatorio: evento.target.checked });
                        }}
                      />
                      Requisito {numero} obligatorio
                    </label>
                  </div>
                  <div className="editar-receta__acciones-requisito">
                    <button
                      type="button"
                      className="boton boton--secundario"
                      disabled={indice === 0}
                      aria-label={`Subir el requisito ${String(numero)}`}
                      onClick={() => {
                        moverRequisito(indice, indice - 1);
                      }}
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      className="boton boton--secundario"
                      disabled={indice === formulario.requisitos.length - 1}
                      aria-label={`Bajar el requisito ${String(numero)}`}
                      onClick={() => {
                        moverRequisito(indice, indice + 1);
                      }}
                    >
                      Bajar
                    </button>
                    <button
                      type="button"
                      className="boton boton--secundario"
                      disabled={formulario.requisitos.length === 1}
                      aria-label={`Quitar el requisito ${String(numero)}`}
                      onClick={() => {
                        quitarRequisito(indice);
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="boton boton--secundario"
            disabled={formulario.requisitos.length >= 30}
            onClick={agregarRequisito}
          >
            Agregar requisito
          </button>
        </fieldset>

        <button type="submit" className="boton" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </main>
  );
}

interface PropiedadesSeleccion {
  readonly etiqueta: string;
  readonly valor: string;
  readonly error: string | null;
  readonly opciones: readonly { readonly valor: string; readonly texto: string }[];
  readonly alCambiar: (valor: string) => void;
}

/** `select` con etiqueta y error accesibles (mismo aspecto que `CampoFormulario`). */
function CampoSeleccion({ etiqueta, valor, error, opciones, alCambiar }: PropiedadesSeleccion) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <select
        id={id}
        className="campo__entrada"
        value={valor}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
      {error && (
        <p className="campo__error" id={idError}>
          {error}
        </p>
      )}
    </div>
  );
}
