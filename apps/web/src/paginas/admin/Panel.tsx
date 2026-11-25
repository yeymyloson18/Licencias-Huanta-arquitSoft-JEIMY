import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { TablaEventos } from '../../componentes/TablaEventos';
import { TarjetaIndicador } from '../../componentes/TarjetaIndicador';
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
            {/* 013 (US3): los mismos datos, en tarjetas de indicador. */}
            <div className="indicadores">
              <TarjetaIndicador
                nombre="Usuarios"
                valor={`${String(carga.panel.usuarios.activos)} activos`}
              >
                <p>{carga.panel.usuarios.inactivos} inactivos</p>
              </TarjetaIndicador>
              <TarjetaIndicador nombre="Usuarios por rol" variante="info">
                <ul className="panel__lista">
                  {ROLES.map((rol) => (
                    <li key={rol.codigo}>
                      <span>{rol.texto}</span>
                      <strong>{carga.panel.porRol[rol.codigo]}</strong>
                    </li>
                  ))}
                </ul>
              </TarjetaIndicador>
              <TarjetaIndicador
                nombre="Cuentas bloqueadas"
                variante="danger"
                {...(carga.panel.bloqueos === null ? {} : { valor: carga.panel.bloqueos.cuentas })}
              >
                {carga.panel.bloqueos === null ? (
                  <p role="status">No disponible: no se pudo consultar el servicio de bloqueos.</p>
                ) : (
                  <p>Orígenes bloqueados: {carga.panel.bloqueos.origenes}</p>
                )}
              </TarjetaIndicador>
              <TarjetaIndicador
                nombre="Sesiones abiertas"
                variante="success"
                valor={carga.panel.sesionesAbiertas}
              />
              <TarjetaIndicador
                nombre="Ingresos fallidos"
                variante="warning"
                valor={`${String(carga.panel.ingresosFallidos.hoy)} hoy`}
              >
                <p>{carga.panel.ingresosFallidos.ultimos7Dias} en los últimos 7 días</p>
              </TarjetaIndicador>
              <TarjetaIndicador
                nombre="Códigos enviados"
                valor={`${String(carga.panel.codigosEnviados.hoy.entregados)} hoy`}
              >
                <p>{carga.panel.codigosEnviados.hoy.conIngreso} terminaron en ingreso correcto</p>
                <p>{carga.panel.codigosEnviados.ultimos7Dias.entregados} en los últimos 7 días</p>
                {carga.panel.codigosEnviados.hoy.fallidos > 0 && (
                  <p>{carga.panel.codigosEnviados.hoy.fallidos} envíos fallaron hoy</p>
                )}
                <p>
                  <Link to="/admin/auditoria?accion=CODIGO_ENVIADO">Ver los códigos enviados</Link>
                </p>
              </TarjetaIndicador>
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
