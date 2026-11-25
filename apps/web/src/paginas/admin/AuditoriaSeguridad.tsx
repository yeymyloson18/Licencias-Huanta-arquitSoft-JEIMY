import { type SyntheticEvent, useCallback, useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import { GRUPOS_ACCIONES, TablaEventos } from '../../componentes/TablaEventos';
import {
  descargarAuditoriaSeguridad,
  type ErrorCampo,
  type FiltroAuditoriaSeguridad,
  guardarArchivo,
  listarUsuarios,
  obtenerAuditoriaSeguridad,
  type PaginaAuditoriaSeguridad,
  type Usuario,
} from '../../servicios/clienteApi';
import { Paginacion } from '../../componentes/Paginacion';

// Auditoría de seguridad del administrador (HU2 de la 009, contracts/portal-administrador.md).
// Los filtros de usuario son listas que envían el identificador interno: ningún texto libre que
// pudiera llevar un correo a la URL (principio VII).

const POR_PAGINA = 20;

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly pagina: PaginaAuditoriaSeguridad }
  | { readonly tipo: 'error'; readonly mensaje: string };

const MENSAJES = {
  'sin-permiso': 'Tu usuario no tiene permiso para ver la auditoría de seguridad.',
  'no-disponible': 'No se pudo cargar la auditoría. Vuelve a intentarlo.',
} as const;

const mensajeDe = (tipo: string): string =>
  tipo === 'sin-permiso' ? MENSAJES['sin-permiso'] : MENSAJES['no-disponible'];

const leerFiltro = (parametros: URLSearchParams): FiltroAuditoriaSeguridad => {
  const filtro: Record<string, string> = {};
  for (const campo of ['desde', 'hasta', 'accion', 'actorId', 'afectadoId']) {
    const valor = parametros.get(campo);
    if (valor !== null && valor !== '') {
      filtro[campo] = valor;
    }
  }
  return filtro;
};

/** Página `/admin/auditoria`. */
export function AuditoriaSeguridad() {
  const id = useId();
  const [parametros, setParametros] = useSearchParams();
  const filtro = leerFiltro(parametros);
  const pagina = Math.max(1, Number(parametros.get('pagina') ?? '1') || 1);
  const claveFiltro = parametros.toString();

  const [borrador, setBorrador] = useState<FiltroAuditoriaSeguridad>(filtro);
  const [usuarios, setUsuarios] = useState<readonly Usuario[]>([]);
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [errores, setErrores] = useState<readonly ErrorCampo[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    void listarUsuarios({ porPagina: 100 }).then((resultado) => {
      setUsuarios(resultado.tipo === 'ok' ? resultado.datos.datos : []);
    });
  }, []);

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    setErrores([]);
    const resultado = await obtenerAuditoriaSeguridad(
      leerFiltro(new URLSearchParams(claveFiltro)),
      pagina,
      POR_PAGINA,
    );
    if (resultado.tipo === 'ok') {
      setCarga({ tipo: 'lista', pagina: resultado.pagina });
    } else if (resultado.tipo === 'invalido') {
      setErrores(resultado.errores);
      setCarga({ tipo: 'error', mensaje: 'Revisa los filtros marcados.' });
    } else {
      setCarga({ tipo: 'error', mensaje: mensajeDe(resultado.tipo) });
    }
  }, [claveFiltro, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aplicar = (nuevo: FiltroAuditoriaSeguridad, nuevaPagina = 1) => {
    const siguiente = new URLSearchParams();
    for (const [campo, valor] of Object.entries(nuevo)) {
      if (typeof valor === 'string' && valor !== '') {
        siguiente.set(campo, valor);
      }
    }
    if (nuevaPagina > 1) {
      siguiente.set('pagina', String(nuevaPagina));
    }
    setParametros(siguiente);
  };

  const filtrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    setAviso(null);
    // Fuera del evento de envío: la navegación de React Router abre una transición y React intentaría
    // armar un FormData del formulario, que no hace falta (y falla en jsdom).
    const filtroElegido = borrador;
    queueMicrotask(() => {
      aplicar(filtroElegido);
    });
  };

  const descargar = async () => {
    setAviso(null);
    const resultado = await descargarAuditoriaSeguridad(borrador);
    if (resultado.tipo === 'ok') {
      guardarArchivo(resultado.csv, resultado.nombre);
      if (resultado.truncado) {
        setAviso(
          'La descarga tiene las 10,000 filas más recientes; acota las fechas para ver el resto.',
        );
      }
      return;
    }
    if (resultado.tipo === 'invalido') {
      setErrores(resultado.errores);
      return;
    }
    setAviso(mensajeDe(resultado.tipo));
  };

  const errorDe = (campo: string) => errores.find((error) => error.campo === campo)?.mensaje;
  const cambiar = (campo: keyof FiltroAuditoriaSeguridad, valor: string) => {
    setBorrador({ ...borrador, [campo]: valor });
  };

  const totalPaginas =
    carga.tipo === 'lista' ? Math.max(1, Math.ceil(carga.pagina.total / POR_PAGINA)) : 1;

  const selectorUsuario = (campo: 'actorId' | 'afectadoId', etiqueta: string) => (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={`${id}-${campo}`}>
        {etiqueta}
      </label>
      <select
        id={`${id}-${campo}`}
        className="campo__entrada"
        value={borrador[campo] ?? ''}
        aria-invalid={errorDe(campo) ? true : undefined}
        onChange={(evento) => {
          cambiar(campo, evento.target.value);
        }}
      >
        <option value="">Cualquiera</option>
        {usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {usuario.nombreCompleto}
          </option>
        ))}
      </select>
      {errorDe(campo) && <p className="campo__error">{errorDe(campo)}</p>}
    </div>
  );

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Auditoría de seguridad</h1>
        <p className="cabecera__descripcion">
          Quién hizo qué y cuándo en los accesos, los usuarios y la configuración.
        </p>
      </header>
      <main className="contenido">
        <form className="tarjeta formulario" onSubmit={filtrar} noValidate>
          <CampoFormulario
            etiqueta="Desde"
            type="date"
            value={borrador.desde ?? ''}
            error={errorDe('desde')}
            onChange={(evento) => {
              cambiar('desde', evento.target.value);
            }}
          />
          <CampoFormulario
            etiqueta="Hasta"
            type="date"
            value={borrador.hasta ?? ''}
            error={errorDe('hasta')}
            onChange={(evento) => {
              cambiar('hasta', evento.target.value);
            }}
          />
          <div className="campo">
            <label className="campo__etiqueta" htmlFor={`${id}-accion`}>
              Acción
            </label>
            <select
              id={`${id}-accion`}
              className="campo__entrada"
              value={borrador.accion ?? ''}
              onChange={(evento) => {
                cambiar('accion', evento.target.value);
              }}
            >
              <option value="">Todas</option>
              {GRUPOS_ACCIONES.map((grupo) => (
                <optgroup key={grupo.grupo} label={grupo.grupo}>
                  {grupo.acciones.map((accion) => (
                    <option key={accion.valor} value={accion.valor}>
                      {accion.texto}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {selectorUsuario('actorId', 'Usuario que actuó')}
          {selectorUsuario('afectadoId', 'Usuario afectado')}
          <div className="formulario__acciones">
            <button type="submit" className="boton">
              Filtrar
            </button>
            <button type="button" className="boton boton--claro" onClick={() => void descargar()}>
              Descargar CSV
            </button>
          </div>
        </form>

        {aviso && (
          <p className="aviso aviso--info" role="status">
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
        {carga.tipo === 'lista' && carga.pagina.datos.length === 0 && (
          <p className="aviso">No hay eventos con esos filtros.</p>
        )}
        {carga.tipo === 'lista' && carga.pagina.datos.length > 0 && (
          <>
            <TablaEventos eventos={carga.pagina.datos} etiqueta="Eventos de la auditoría" />
            <Paginacion
              etiqueta="Páginas de la auditoría"
              pagina={pagina}
              total={totalPaginas}
              alCambiar={(n) => {
                aplicar(filtro, n);
              }}
            />
          </>
        )}
      </main>
    </>
  );
}
