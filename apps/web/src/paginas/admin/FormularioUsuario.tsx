import { type SyntheticEvent, useState } from 'react';
import { CampoFormulario } from '../../componentes/CampoFormulario';
import {
  actualizarUsuario,
  asignarClaveTemporal,
  asignarRoles,
  crearUsuario,
  type ResultadoOperacion,
  type Rol,
  type Usuario,
} from '../../servicios/clienteApi';
import { ROLES } from './roles';

type Errores = Partial<Record<string, string>>;

interface Propiedades {
  /** Sin usuario: alta. Con usuario: edición. */
  readonly usuario?: Usuario;
  readonly alGuardar: (aviso: string) => void;
  readonly alCancelar: () => void;
}

const MENSAJE_GENERAL: Readonly<Record<string, string>> = {
  'ultimo-administrador': 'Debe existir al menos un administrador activo',
  'no-encontrado': 'El usuario ya no existe',
  'sin-permiso': 'No tiene permiso para esta operación',
  'no-disponible': 'No se pudo guardar en este momento. Inténtelo en unos minutos.',
};

/**
 * Alta y edición de un usuario del personal (contracts/portal-seguridad.md). El celular actual se
 * muestra siempre enmascarado; para cambiarlo se escribe el número nuevo (FR-028).
 */
export function FormularioUsuario({ usuario, alGuardar, alCancelar }: Propiedades) {
  const esAlta = usuario === undefined;
  const [correo, setCorreo] = useState('');
  const [nombre, setNombre] = useState(usuario?.nombreCompleto ?? '');
  const [celular, setCelular] = useState('');
  const [claveTemporal, setClaveTemporal] = useState('');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [roles, setRoles] = useState<Rol[]>(usuario?.roles ?? []);
  const [errores, setErrores] = useState<Errores>({});
  const [alerta, setAlerta] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Clave temporal en edición (FR-022b): se pide confirmación antes de enviarla.
  const [nuevaClave, setNuevaClave] = useState('');
  const [confirmandoClave, setConfirmandoClave] = useState(false);
  const [avisoClave, setAvisoClave] = useState<string | null>(null);

  const alternarRol = (codigo: Rol) => {
    setRoles((actuales) =>
      actuales.includes(codigo) ? actuales.filter((r) => r !== codigo) : [...actuales, codigo],
    );
  };

  /** Traduce un resultado fallido en errores por campo o en una alerta general. */
  const mostrarFallo = (resultado: Exclude<ResultadoOperacion<unknown>, { tipo: 'ok' }>) => {
    if (resultado.tipo === 'invalido') {
      const porCampo: Errores = {};
      for (const { campo, mensaje } of resultado.errores) {
        porCampo[campo] = porCampo[campo] ? `${porCampo[campo]}. ${mensaje}` : mensaje;
      }
      setErrores(porCampo);
    } else if (resultado.tipo === 'correo-en-uso') {
      setErrores({ correo: 'El correo ya está en uso' });
    } else {
      setAlerta(MENSAJE_GENERAL[resultado.tipo] ?? MENSAJE_GENERAL['no-disponible'] ?? null);
    }
  };

  const guardar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    setErrores({});
    setAlerta(null);
    if (roles.length === 0) {
      setErrores({ roles: 'Elija al menos un rol' });
      return;
    }
    setEnviando(true);
    try {
      if (esAlta) {
        const resultado = await crearUsuario({
          correo,
          nombreCompleto: nombre,
          celular,
          claveTemporal,
          roles,
        });
        if (resultado.tipo === 'ok') {
          alGuardar('Usuario creado');
        } else {
          mostrarFallo(resultado);
        }
        return;
      }

      const cambios = {
        ...(nombre !== usuario.nombreCompleto ? { nombreCompleto: nombre } : {}),
        ...(celular !== '' ? { celular } : {}),
        ...(activo !== usuario.activo ? { activo } : {}),
      };
      if (Object.keys(cambios).length > 0) {
        const resultado = await actualizarUsuario(usuario.id, cambios);
        if (resultado.tipo !== 'ok') {
          mostrarFallo(resultado);
          return;
        }
      }
      const rolesCambiaron =
        roles.length !== usuario.roles.length || roles.some((r) => !usuario.roles.includes(r));
      if (rolesCambiaron) {
        const resultado = await asignarRoles(usuario.id, roles);
        if (resultado.tipo !== 'ok') {
          mostrarFallo(resultado);
          return;
        }
      }
      alGuardar('Cambios guardados');
    } finally {
      setEnviando(false);
    }
  };

  const confirmarClave = async () => {
    if (usuario === undefined) {
      return;
    }
    setConfirmandoClave(false);
    const resultado = await asignarClaveTemporal(usuario.id, nuevaClave);
    if (resultado.tipo === 'ok') {
      setNuevaClave('');
      setErrores({});
      setAvisoClave('Clave temporal asignada');
    } else if (resultado.tipo === 'invalido') {
      setErrores({ nuevaClave: resultado.errores.map((e) => e.mensaje).join('. ') });
    } else {
      mostrarFallo(resultado);
    }
  };

  return (
    <section className="tarjeta formulario" aria-labelledby="titulo-formulario">
      <h2 id="titulo-formulario">{esAlta ? 'Nuevo usuario' : 'Editar usuario'}</h2>
      {alerta && (
        <p className="aviso aviso--error" role="alert">
          {alerta}
        </p>
      )}
      <form onSubmit={(evento) => void guardar(evento)} noValidate>
        {esAlta ? (
          <CampoFormulario
            etiqueta="Correo"
            type="email"
            autoComplete="off"
            required
            value={correo}
            error={errores.correo}
            onChange={(evento) => {
              setCorreo(evento.target.value);
            }}
          />
        ) : (
          <p>
            <strong>Correo:</strong> {usuario.correo}
          </p>
        )}
        <CampoFormulario
          etiqueta="Nombre completo"
          autoComplete="off"
          required
          value={nombre}
          error={errores.nombreCompleto}
          onChange={(evento) => {
            setNombre(evento.target.value);
          }}
        />
        <CampoFormulario
          etiqueta={esAlta ? 'Celular' : 'Celular nuevo (opcional)'}
          inputMode="numeric"
          autoComplete="off"
          maxLength={9}
          value={celular}
          ayuda={esAlta ? '9 dígitos, empieza con 9.' : `Actual: ${usuario.celularEnmascarado}`}
          error={errores.celular}
          onChange={(evento) => {
            setCelular(evento.target.value.replace(/\D/g, ''));
          }}
        />
        {esAlta && (
          <>
            <CampoFormulario
              etiqueta="Clave temporal"
              type="password"
              autoComplete="new-password"
              required
              value={claveTemporal}
              ayuda="Al menos 12 caracteres, con letras y números."
              error={errores.claveTemporal}
              onChange={(evento) => {
                setClaveTemporal(evento.target.value);
              }}
            />
            <p className="aviso aviso--info">
              Entregue la clave temporal en persona; el usuario deberá cambiarla al ingresar.
            </p>
          </>
        )}
        {!esAlta && (
          <label className="casilla">
            <input
              type="checkbox"
              checked={activo}
              onChange={(evento) => {
                setActivo(evento.target.checked);
              }}
            />
            Activo
          </label>
        )}
        <fieldset className="roles" aria-describedby={errores.roles ? 'error-roles' : undefined}>
          <legend>Roles</legend>
          {ROLES.map((rol) => (
            <label key={rol.codigo} className="casilla">
              <input
                type="checkbox"
                checked={roles.includes(rol.codigo)}
                onChange={() => {
                  alternarRol(rol.codigo);
                }}
              />
              {rol.nombre}
            </label>
          ))}
          {errores.roles && (
            <p className="campo__error" id="error-roles">
              {errores.roles}
            </p>
          )}
        </fieldset>
        <div className="formulario__acciones">
          <button type="submit" className="boton" disabled={enviando}>
            Guardar
          </button>
          <button type="button" className="boton boton--secundario" onClick={alCancelar}>
            Cancelar
          </button>
        </div>
      </form>

      {!esAlta && (
        <div className="formulario__seccion">
          <h3>Clave temporal</h3>
          {avisoClave && (
            <p className="aviso aviso--info" role="status">
              {avisoClave}
            </p>
          )}
          <CampoFormulario
            etiqueta="Nueva clave temporal"
            type="password"
            autoComplete="new-password"
            value={nuevaClave}
            ayuda="Para quien olvidó su clave. Al menos 12 caracteres, con letras y números."
            error={errores.nuevaClave}
            onChange={(evento) => {
              setNuevaClave(evento.target.value);
            }}
          />
          {confirmandoClave ? (
            <div className="aviso" role="group" aria-label="Confirmar clave temporal">
              <p>
                ¿Asignar esta clave temporal? Se cerrarán todas sus sesiones y deberá cambiarla al
                ingresar.
              </p>
              <div className="formulario__acciones">
                <button type="button" className="boton" onClick={() => void confirmarClave()}>
                  Confirmar
                </button>
                <button
                  type="button"
                  className="boton boton--secundario"
                  onClick={() => {
                    setConfirmandoClave(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="boton boton--secundario"
              disabled={nuevaClave === ''}
              onClick={() => {
                setAvisoClave(null);
                setConfirmandoClave(true);
              }}
            >
              Asignar clave temporal
            </button>
          )}
        </div>
      )}
    </section>
  );
}
