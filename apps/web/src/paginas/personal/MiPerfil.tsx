import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { nombreDelRol } from '../../componentes/roles';
import { formatearFechaHora } from '../../componentes/TablaEventos';
import { obtenerMiPerfil, type PerfilPropio, type Rol } from '../../servicios/clienteApi';

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error' }
  | { readonly tipo: 'listo'; readonly perfil: PerfilPropio };

const MENSAJE_SIN_ROL = 'Todavía no tiene un rol asignado. Consulte con el administrador.';

const textoSesiones = (cantidad: number): string =>
  cantidad === 1 ? '1 sesión abierta' : `${String(cantidad)} sesiones abiertas`;

const textoRoles = (roles: readonly Rol[]): string =>
  roles.length === 0 ? 'Sin roles' : roles.map(nombreDelRol).join(', ');

/**
 * Mi perfil (011, HU2): solo los datos de quien tiene la sesión. Nunca la clave, ningún código ni el
 * celular completo. El aviso "Su clave se cambió" lo muestra el aviso común (AvisoNavegacion).
 */
export function MiPerfil() {
  const ubicacion = useLocation();
  const sinRol = (ubicacion.state as { sinRol?: unknown } | null)?.sinRol === true;
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    const resultado = await obtenerMiPerfil();
    setCarga(resultado.tipo === 'ok' ? { tipo: 'listo', perfil: resultado.datos } : resultado);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Mi perfil</h1>
        <p className="cabecera__descripcion">Sus datos en el sistema. Solo usted los ve.</p>
      </header>
      <main className="contenido">
        {sinRol && (
          <p className="aviso aviso--info" role="status">
            {MENSAJE_SIN_ROL}
          </p>
        )}
        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando…
          </p>
        )}
        {carga.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>No se pudo cargar su perfil. Inténtelo de nuevo.</p>
            <button type="button" className="boton" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}
        {carga.tipo === 'listo' && (
          <section className="ficha perfil" aria-label="Mis datos">
            <dl className="ficha__datos">
              <div className="ficha__dato">
                <dt>Nombre completo</dt>
                <dd>{carga.perfil.nombreCompleto}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Correo</dt>
                <dd className="perfil__correo">{carga.perfil.correo}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Celular</dt>
                <dd>{carga.perfil.celularEnmascarado}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Roles</dt>
                <dd>{textoRoles(carga.perfil.roles)}</dd>
              </div>
              <div className="ficha__dato">
                <dt>Último ingreso</dt>
                <dd>
                  {carga.perfil.ultimoIngreso === null
                    ? 'Sin registro'
                    : formatearFechaHora(carga.perfil.ultimoIngreso)}
                </dd>
              </div>
              <div className="ficha__dato">
                <dt>Sesiones abiertas</dt>
                <dd>{textoSesiones(carga.perfil.sesionesAbiertas)}</dd>
              </div>
            </dl>
            <Link to="/cambiar-clave" className="boton perfil__accion">
              Cambiar mi clave
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
