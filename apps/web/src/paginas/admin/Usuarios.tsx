import { type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import {
  buscarUsuarios,
  listarUsuarios,
  type PaginaUsuarios,
  type Usuario,
} from '../../servicios/clienteApi';
import { FormularioUsuario } from './FormularioUsuario';
import { nombreDelRol } from './roles';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

type Estado =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly pagina: PaginaUsuarios }
  | { readonly tipo: 'error' };

type Vista =
  | { readonly tipo: 'lista' }
  | { readonly tipo: 'alta' }
  | { readonly tipo: 'edicion'; readonly usuario: Usuario };

const activoDe = (filtro: FiltroEstado): boolean | undefined =>
  filtro === 'todos' ? undefined : filtro === 'activos';

/**
 * Gestión de usuarios del personal, solo para el administrador (historia 5,
 * contracts/portal-seguridad.md). En celular cada usuario es una tarjeta; 20 por página.
 */
export function Usuarios() {
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  const [texto, setTexto] = useState('');
  const [textoAplicado, setTextoAplicado] = useState('');
  const [numeroPagina, setNumeroPagina] = useState(1);
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    const activo = activoDe(filtro);
    const resultado =
      textoAplicado === ''
        ? await listarUsuarios({ activo, pagina: numeroPagina })
        : await buscarUsuarios({ texto: textoAplicado, activo, pagina: numeroPagina });
    setEstado(
      resultado.tipo === 'ok' ? { tipo: 'lista', pagina: resultado.datos } : { tipo: 'error' },
    );
  }, [filtro, textoAplicado, numeroPagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alBuscar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    setNumeroPagina(1);
    setTextoAplicado(texto.trim().length >= 2 ? texto.trim() : '');
  };

  const alGuardar = (mensaje: string) => {
    setVista({ tipo: 'lista' });
    setAviso(mensaje);
    void cargar();
  };

  const totalPaginas =
    estado.tipo === 'lista'
      ? Math.max(1, Math.ceil(estado.pagina.total / estado.pagina.porPagina))
      : 1;

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Usuarios</h1>
        <p className="cabecera__descripcion">Personal municipal, roles y accesos.</p>
      </header>

      <main className="contenido">
        {aviso && vista.tipo === 'lista' && (
          <p className="aviso aviso--info" role="status">
            {aviso}
          </p>
        )}

        {vista.tipo !== 'lista' ? (
          <FormularioUsuario
            key={vista.tipo === 'edicion' ? vista.usuario.id : 'alta'}
            usuario={vista.tipo === 'edicion' ? vista.usuario : undefined}
            alGuardar={alGuardar}
            alCancelar={() => {
              setVista({ tipo: 'lista' });
            }}
          />
        ) : (
          <>
            <div className="barra-usuarios">
              <form className="barra-usuarios__busqueda" onSubmit={alBuscar} role="search">
                <label className="campo__etiqueta" htmlFor="buscar-usuarios">
                  Buscar por nombre o correo
                </label>
                <div className="barra-usuarios__fila">
                  <input
                    id="buscar-usuarios"
                    className="campo__entrada"
                    type="search"
                    autoComplete="off"
                    value={texto}
                    onChange={(evento) => {
                      setTexto(evento.target.value);
                    }}
                  />
                  <button type="submit" className="boton">
                    Buscar
                  </button>
                </div>
              </form>
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="filtro-estado">
                  Estado
                </label>
                <select
                  id="filtro-estado"
                  className="campo__entrada"
                  value={filtro}
                  onChange={(evento) => {
                    setNumeroPagina(1);
                    setFiltro(evento.target.value as FiltroEstado);
                  }}
                >
                  <option value="todos">Todos</option>
                  <option value="activos">Activos</option>
                  <option value="inactivos">Inactivos</option>
                </select>
              </div>
              <button
                type="button"
                className="boton"
                onClick={() => {
                  setAviso(null);
                  setVista({ tipo: 'alta' });
                }}
              >
                Nuevo usuario
              </button>
            </div>

            {estado.tipo === 'cargando' && (
              <p className="aviso" role="status">
                Cargando usuarios…
              </p>
            )}

            {estado.tipo === 'error' && (
              <div className="aviso aviso--error" role="alert">
                <p>No se pudo cargar la lista de usuarios.</p>
                <button type="button" className="boton" onClick={() => void cargar()}>
                  Reintentar
                </button>
              </div>
            )}

            {estado.tipo === 'lista' && estado.pagina.datos.length === 0 && (
              <p className="aviso">No hay usuarios que coincidan</p>
            )}

            {estado.tipo === 'lista' && estado.pagina.datos.length > 0 && (
              <>
                <ul className="lista-usuarios" aria-label="Usuarios del personal">
                  {estado.pagina.datos.map((usuario) => (
                    <li key={usuario.id} className="tarjeta tarjeta-usuario">
                      <p className="tarjeta-usuario__nombre">{usuario.nombreCompleto}</p>
                      <p className="tarjeta-usuario__correo">{usuario.correo}</p>
                      <ul className="etiquetas" aria-label="Roles">
                        {usuario.roles.map((rol) => (
                          <li key={rol} className="etiqueta">
                            {nombreDelRol(rol)}
                          </li>
                        ))}
                      </ul>
                      <p
                        className={`estado ${usuario.activo ? 'estado--activo' : 'estado--inactivo'}`}
                      >
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </p>
                      <button
                        type="button"
                        className="boton boton--secundario"
                        onClick={() => {
                          setAviso(null);
                          setVista({ tipo: 'edicion', usuario });
                        }}
                      >
                        Editar
                      </button>
                    </li>
                  ))}
                </ul>
                {totalPaginas > 1 && (
                  <nav className="paginacion" aria-label="Páginas">
                    <button
                      type="button"
                      className="boton boton--secundario"
                      disabled={numeroPagina <= 1}
                      onClick={() => {
                        setNumeroPagina((n) => n - 1);
                      }}
                    >
                      Anterior
                    </button>
                    <span>
                      Página {numeroPagina} de {totalPaginas}
                    </span>
                    <button
                      type="button"
                      className="boton boton--secundario"
                      disabled={numeroPagina >= totalPaginas}
                      onClick={() => {
                        setNumeroPagina((n) => n + 1);
                      }}
                    >
                      Siguiente
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
