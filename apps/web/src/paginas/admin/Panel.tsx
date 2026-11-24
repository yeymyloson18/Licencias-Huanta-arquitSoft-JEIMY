import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { TablaEventos } from '../../componentes/TablaEventos';
import { HerramientasTecnicas } from './HerramientasTecnicas';
import { obtenerPanel, type PanelAdministrador } from '../../servicios/clienteApi';

// Panel del administrador (HU1 de la 009, contracts/portal-administrador.md): el estado de los
// usuarios y de la seguridad de un vistazo, con accesos directos.

const ROLES: readonly {
  readonly codigo: keyof PanelAdministrador['porRol'];
  readonly texto: string;
}[] = [
  { codigo: 'MESA_PARTES', texto: 'Mesa de partes' },
  { codigo: 'EVALUADOR', texto: 'Evaluador' },
  { codigo: 'INSPECTOR', texto: 'Inspector' },
  { codigo: 'CAJA', texto: 'Caja' },
  { codigo: 'JEFATURA', texto: 'Jefatura' },
  { codigo: 'ADMINISTRADOR', texto: 'Administrador' },
];

type Carga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'listo'; readonly panel: PanelAdministrador }
  | { readonly tipo: 'error'; readonly mensaje: string };

function Tarjeta({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: React.ReactNode;
}) {
  const id = `tarjeta-${titulo.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section className="tarjeta" aria-labelledby={id}>
      <h2 id={id} className="ficha__nombre">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Página `/admin`: inicio del administrador. */
export function Panel() {
  const [carga, setCarga] = useState<Carga>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setCarga({ tipo: 'cargando' });
    const resultado = await obtenerPanel();
    if (resultado.tipo === 'ok') {
      setCarga({ tipo: 'listo', panel: resultado.panel });
      return;
    }
    setCarga({
      tipo: 'error',
      mensaje:
        resultado.tipo === 'sin-permiso'
          ? 'Tu usuario no tiene permiso para ver el panel.'
          : 'No se pudo cargar el panel. Vuelve a intentarlo.',
    });
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Panel del administrador</h1>
        <p className="cabecera__descripcion">Usuarios, roles y seguridad del sistema.</p>
      </header>
      <main className="contenido">
        <nav className="panel__accesos" aria-label="Accesos directos">
          <Link className="boton boton--claro" to="/admin/usuarios">
            Usuarios
          </Link>
          <Link className="boton boton--claro" to="/admin/auditoria">
            Auditoría
          </Link>
          <Link className="boton boton--claro" to="/admin/catalogo">
            Catálogo
          </Link>
          <Link className="boton boton--claro" to="/admin/feriados">
            Feriados
          </Link>
          <button type="button" className="boton" onClick={() => void cargar()}>
            Actualizar
          </button>
        </nav>

        {carga.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando…
          </p>
        )}
        {carga.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>{carga.mensaje}</p>
            <button type="button" className="boton boton--claro" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}
        {carga.tipo === 'listo' && (
          <>
            <div className="panel__tarjetas">
              <Tarjeta titulo="Usuarios">
                <p className="panel__cifra">{carga.panel.usuarios.activos} activos</p>
                <p>{carga.panel.usuarios.inactivos} inactivos</p>
              </Tarjeta>
              <Tarjeta titulo="Usuarios por rol">
                <ul className="panel__lista">
                  {ROLES.map((rol) => (
                    <li key={rol.codigo}>
                      <span>{rol.texto}</span>
                      <strong>{carga.panel.porRol[rol.codigo]}</strong>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
              <Tarjeta titulo="Cuentas bloqueadas">
                {carga.panel.bloqueos === null ? (
                  <p role="status">No disponible: no se pudo consultar el servicio de bloqueos.</p>
                ) : (
                  <>
                    <p className="panel__cifra">{carga.panel.bloqueos.cuentas}</p>
                    <p>Orígenes bloqueados: {carga.panel.bloqueos.origenes}</p>
                  </>
                )}
              </Tarjeta>
              <Tarjeta titulo="Sesiones abiertas">
                <p className="panel__cifra">{carga.panel.sesionesAbiertas}</p>
              </Tarjeta>
              <Tarjeta titulo="Ingresos fallidos">
                <p className="panel__cifra">{carga.panel.ingresosFallidos.hoy} hoy</p>
                <p>{carga.panel.ingresosFallidos.ultimos7Dias} en los últimos 7 días</p>
              </Tarjeta>
              <Tarjeta titulo="Códigos enviados">
                <p className="panel__cifra">{carga.panel.codigosEnviados.hoy.entregados} hoy</p>
                <p>{carga.panel.codigosEnviados.hoy.conIngreso} terminaron en ingreso correcto</p>
                <p>{carga.panel.codigosEnviados.ultimos7Dias.entregados} en los últimos 7 días</p>
                {carga.panel.codigosEnviados.hoy.fallidos > 0 && (
                  <p>{carga.panel.codigosEnviados.hoy.fallidos} envíos fallaron hoy</p>
                )}
                <p>
                  <Link to="/admin/auditoria?accion=CODIGO_ENVIADO">Ver los códigos enviados</Link>
                </p>
              </Tarjeta>
            </div>
            <section className="tarjeta" aria-labelledby="ultimos-eventos">
              <h2 id="ultimos-eventos" className="ficha__nombre">
                Últimos eventos
              </h2>
              <TablaEventos
                eventos={carga.panel.ultimosEventos}
                etiqueta="Tabla de los últimos eventos"
              />
              <p>
                <Link to="/admin/auditoria">Ver toda la auditoría</Link>
              </p>
            </section>
            <HerramientasTecnicas />
          </>
        )}
      </main>
    </>
  );
}
