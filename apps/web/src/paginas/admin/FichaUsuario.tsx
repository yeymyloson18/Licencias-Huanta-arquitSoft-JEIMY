import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import { Confirmacion } from '../../componentes/Confirmacion';
import { formatearFechaHora, TablaEventos } from '../../componentes/TablaEventos';
import {
  actualizarUsuario,
  asignarClaveTemporal,
  cerrarSesionesDeUsuario,
  desbloquearUsuario,
  type FichaUsuario as Ficha,
  obtenerFichaUsuario,
} from '../../servicios/clienteApi';
import { useSesion } from '../../sesion/ProveedorSesion';
import { nombreDelRol } from '../../componentes/roles';
import { TablaAdaptable } from '../../componentes/TablaAdaptable';

// Ficha del usuario (HU3 de la 009, contracts/portal-administrador.md): datos con el celular
// enmascarado, estado de seguridad, historial de roles y acciones rápidas con confirmación.

type Accion = 'cerrar-sesiones' | 'desbloquear' | 'desactivar' | 'reactivar' | 'clave-temporal';

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly ficha: Ficha }
  | { readonly tipo: 'error'; readonly mensaje: string };

const TEXTOS: Readonly<
  Record<Accion, { readonly titulo: string; readonly mensaje: string; readonly boton: string }>
> = {
  'cerrar-sesiones': {
    titulo: 'Cerrar todas sus sesiones',
    mensaje:
      'Sus sesiones dejarán de servir al instante. El usuario seguirá activo y podrá volver a ingresar.',
    boton: 'Cerrar sesiones',
  },
  desbloquear: {
    titulo: 'Desbloquear cuenta',
    mensaje: 'Se borrarán sus intentos fallidos y podrá volver a intentar sin esperar.',
    boton: 'Desbloquear',
  },
  desactivar: {
    titulo: 'Desactivar usuario',
    mensaje: 'No podrá ingresar y sus sesiones se cerrarán al instante. No se borra nada.',
    boton: 'Desactivar',
  },
  reactivar: {
    titulo: 'Reactivar usuario',
    mensaje: 'Podrá volver a ingresar con su clave.',
    boton: 'Reactivar',
  },
  'clave-temporal': {
    titulo: 'Asignar clave temporal',
    mensaje: 'La clave anterior dejará de servir y deberá cambiar esta en su próximo ingreso.',
    boton: 'Asignar clave',
  },
};

const fecha = (iso: string | null | undefined): string =>
  iso === null || iso === undefined ? '—' : formatearFechaHora(iso);

/** Página `/admin/usuarios/:id`. */
export function FichaUsuario() {
  const { id = '' } = useParams();
  const { sesion } = useSesion();
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });
  const [accion, setAccion] = useState<Accion | null>(null);
  const [clave, setClave] = useState('');
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ readonly texto: string; readonly error: boolean } | null>(
    null,
  );

  const esPropia = sesion?.usuario.id === id;

  const cargar = useCallback(async () => {
    const resultado = await obtenerFichaUsuario(id);
    if (resultado.tipo === 'ok') {
      setCarga({ tipo: 'lista', ficha: resultado.ficha });
      return;
    }
    setCarga({
      tipo: 'error',
      mensaje:
        resultado.tipo === 'no-encontrado'
          ? 'El usuario no existe.'
          : resultado.tipo === 'sin-permiso'
            ? 'Tu usuario no tiene permiso para ver esta ficha.'
            : 'No se pudo cargar la ficha. Vuelve a intentarlo.',
    });
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrir = (nueva: Accion) => {
    setAviso(null);
    setClave('');
    setErrorClave(null);
    setAccion(nueva);
  };

  const terminar = (texto: string, error = false) => {
    setAviso({ texto, error });
    setAccion(null);
    void cargar();
  };

  const confirmar = async () => {
    if (accion === null) {
      return;
    }
    setEnviando(true);
    try {
      switch (accion) {
        case 'cerrar-sesiones': {
          const r = await cerrarSesionesDeUsuario(id);
          if (r.tipo === 'ok') {
            terminar(
              r.sesionesCerradas === 1
                ? 'Se cerró 1 sesión.'
                : `Se cerraron ${String(r.sesionesCerradas)} sesiones.`,
            );
          } else {
            terminar(mensajeDeFalla(r.tipo), true);
          }
          return;
        }
        case 'desbloquear': {
          const r = await desbloquearUsuario(id);
          terminar(
            r.tipo === 'ok' ? 'La cuenta quedó desbloqueada.' : mensajeDeFalla(r.tipo),
            r.tipo !== 'ok',
          );
          return;
        }
        case 'desactivar':
        case 'reactivar': {
          const r = await actualizarUsuario(id, { activo: accion === 'reactivar' });
          if (r.tipo === 'ok') {
            terminar(
              accion === 'reactivar' ? 'El usuario quedó activo.' : 'El usuario quedó desactivado.',
            );
          } else {
            terminar(
              r.tipo === 'ultimo-administrador'
                ? 'Debe quedar al menos un administrador activo.'
                : mensajeDeFalla(r.tipo),
              true,
            );
          }
          return;
        }
        case 'clave-temporal': {
          const r = await asignarClaveTemporal(id, clave);
          if (r.tipo === 'invalido') {
            setErrorClave(r.errores.map((e) => e.mensaje).join('. ') || 'La clave no es válida');
            return;
          }
          terminar(
            r.tipo === 'ok'
              ? 'Se asignó la clave temporal y se cerraron sus sesiones.'
              : mensajeDeFalla(r.tipo),
            r.tipo !== 'ok',
          );
          return;
        }
      }
    } finally {
      setEnviando(false);
    }
  };

  if (carga.tipo === 'cargando') {
    return (
      <main className="contenido">
        <p className="aviso" role="status">
          Cargando…
        </p>
      </main>
    );
  }
  if (carga.tipo === 'error') {
    return (
      <main className="contenido">
        <p className="aviso aviso--error" role="alert">
          {carga.mensaje}
        </p>
        <Link to="/admin/usuarios">Volver a Usuarios</Link>
      </main>
    );
  }

  const { ficha } = carga;
  const bloqueo =
    ficha.bloqueo === null
      ? 'No disponible'
      : ficha.bloqueo.bloqueada
        ? `Bloqueada hasta ${fecha(ficha.bloqueo.hasta)}`
        : 'No bloqueada';

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Ficha del usuario</p>
        <h1 className="cabecera__titulo">{ficha.nombreCompleto}</h1>
      </header>
      <main className="contenido">
        <p>
          <Link to="/admin/usuarios">Volver a Usuarios</Link>
        </p>
        {aviso && (
          <p
            className={`aviso ${aviso.error ? 'aviso--error' : 'aviso--info'}`}
            role={aviso.error ? 'alert' : 'status'}
          >
            {aviso.texto}
          </p>
        )}

        <section className="tarjeta" aria-labelledby="ficha-datos">
          <h2 id="ficha-datos" className="ficha__nombre">
            Datos y seguridad
          </h2>
          <dl className="ficha-usuario__datos">
            <dt>Correo</dt>
            <dd>{ficha.correo}</dd>
            <dt>Celular</dt>
            <dd>{ficha.celularEnmascarado}</dd>
            <dt>Roles</dt>
            <dd>{ficha.roles.map(nombreDelRol).join(', ')}</dd>
            <dt>Estado</dt>
            <dd>{ficha.activo ? 'Activo' : 'Inactivo'}</dd>
            <dt>Último ingreso</dt>
            <dd>{fecha(ficha.ultimoIngreso)}</dd>
            <dt>Sesiones abiertas</dt>
            <dd>{ficha.sesionesAbiertas}</dd>
            <dt>Bloqueo</dt>
            <dd>{bloqueo}</dd>
          </dl>
        </section>

        <section className="tarjeta" aria-labelledby="ficha-acciones">
          <h2 id="ficha-acciones" className="ficha__nombre">
            Acciones
          </h2>
          <div className="panel__accesos">
            {!esPropia && (
              <>
                <button
                  type="button"
                  className="boton"
                  onClick={() => {
                    abrir('cerrar-sesiones');
                  }}
                >
                  Cerrar todas sus sesiones
                </button>
                <button
                  type="button"
                  className="boton"
                  disabled={ficha.bloqueo === null}
                  aria-describedby={ficha.bloqueo === null ? 'ficha-sin-bloqueos' : undefined}
                  onClick={() => {
                    abrir('desbloquear');
                  }}
                >
                  Desbloquear cuenta
                </button>
              </>
            )}
            {ficha.activo ? (
              <button
                type="button"
                className="boton boton--claro"
                onClick={() => {
                  abrir('desactivar');
                }}
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                className="boton boton--claro"
                onClick={() => {
                  abrir('reactivar');
                }}
              >
                Reactivar
              </button>
            )}
            <button
              type="button"
              className="boton boton--claro"
              onClick={() => {
                abrir('clave-temporal');
              }}
            >
              Asignar clave temporal
            </button>
          </div>
          {!esPropia && ficha.bloqueo === null && (
            <p id="ficha-sin-bloqueos" className="campo__ayuda">
              El servicio de bloqueos no responde: no se puede desbloquear ahora.
            </p>
          )}
          {esPropia && (
            <p className="campo__ayuda">
              Es su propia cuenta: para cerrar su sesión use “Cerrar sesión” en el menú.
            </p>
          )}
        </section>

        <section className="tarjeta" aria-labelledby="ficha-historial">
          <h2 id="ficha-historial" className="ficha__nombre">
            Historial de roles
          </h2>
          <TablaAdaptable etiqueta="Tabla del historial de roles">
            <table className="table table-hover tabla tabla--apilable">
              <thead>
                <tr>
                  <th scope="col">Rol</th>
                  <th scope="col">Asignado por</th>
                  <th scope="col">El</th>
                  <th scope="col">Retirado por</th>
                  <th scope="col">El</th>
                </tr>
              </thead>
              <tbody>
                {ficha.historialRoles.map((asignacion) => (
                  <tr key={`${asignacion.rol}-${asignacion.asignadoEn}`}>
                    <td data-etiqueta="Rol">{nombreDelRol(asignacion.rol)}</td>
                    <td data-etiqueta="Asignado por">{asignacion.asignadoPor.nombre}</td>
                    <td data-etiqueta="Asignado el">{fecha(asignacion.asignadoEn)}</td>
                    <td data-etiqueta="Retirado por">
                      {asignacion.retiradoPor?.nombre ?? 'Vigente'}
                    </td>
                    <td data-etiqueta="Retirado el">{fecha(asignacion.retiradoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaAdaptable>
        </section>

        <section className="tarjeta" aria-labelledby="ficha-eventos">
          <h2 id="ficha-eventos" className="ficha__nombre">
            Últimos eventos
          </h2>
          <TablaEventos eventos={ficha.ultimosEventos} etiqueta="Tabla de sus últimos eventos" />
          <p>
            <Link to={`/admin/auditoria?afectadoId=${id}`}>Ver su auditoría completa</Link>
          </p>
        </section>

        {accion !== null && (
          <Confirmacion
            titulo={TEXTOS[accion].titulo}
            mensaje={TEXTOS[accion].mensaje}
            textoConfirmar={TEXTOS[accion].boton}
            enviando={enviando}
            onConfirmar={() => void confirmar()}
            onCancelar={() => {
              setAccion(null);
            }}
          >
            {accion === 'clave-temporal' && (
              <CampoFormulario
                etiqueta="Clave temporal"
                type="password"
                autoComplete="new-password"
                value={clave}
                error={errorClave}
                ayuda="Al menos 12 caracteres, con letras y números."
                onChange={(evento) => {
                  setClave(evento.target.value);
                }}
              />
            )}
          </Confirmacion>
        )}
      </main>
    </>
  );
}

const mensajeDeFalla = (tipo: string): string => {
  switch (tipo) {
    case 'sobre-si-mismo':
      return 'Esta acción no se puede hacer sobre su propia cuenta.';
    case 'no-encontrado':
      return 'El usuario ya no existe.';
    case 'sin-permiso':
      return 'Tu usuario no tiene permiso para esta acción.';
    default:
      return 'No se pudo completar la acción. Vuelve a intentarlo.';
  }
};
