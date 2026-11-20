import { Outlet, Route, Routes, useLocation } from 'react-router';
import { Menu } from './componentes/Menu';
import { RutaProtegida } from './componentes/RutaProtegida';
import { Catalogo } from './paginas/admin/Catalogo';
import { EditarReceta } from './paginas/admin/EditarReceta';
import { Usuarios } from './paginas/admin/Usuarios';
import { Asistente } from './paginas/Asistente';
import { CambiarClave } from './paginas/CambiarClave';
import { Consulta } from './paginas/Consulta';
import { Ingresar } from './paginas/Ingresar';
import { Inicio } from './paginas/Inicio';
import { Licencia } from './paginas/Licencia';
import { Comprobante } from './paginas/tramite/Comprobante';
import { Identidad } from './paginas/tramite/Identidad';
import { Solicitud } from './paginas/tramite/Solicitud';
import { useSesion } from './sesion/ProveedorSesion';
import { ProveedorTramite } from './tramite/ContextoTramite';

interface EstadoNavegacion {
  readonly aviso?: string;
}

/** Diseño común: menú del personal y aviso pendiente (cierre por inactividad, clave cambiada…). */
function Diseno() {
  const { aviso } = useSesion();
  const ubicacion = useLocation();
  const avisoNavegacion = (ubicacion.state as EstadoNavegacion | null)?.aviso;
  const mensaje = avisoNavegacion ?? aviso;

  return (
    <>
      <Menu />
      {mensaje && (
        <p className="aviso aviso--info" role="status">
          {mensaje}
        </p>
      )}
      <Outlet />
    </>
  );
}

/**
 * Rutas del portal (contracts/portal-seguridad.md; portal-tramite.md de la 004). Las usan main.tsx y
 * las pruebas. El trámite en línea vive por encima de las rutas, solo en memoria.
 */
export function RutasAplicacion() {
  return (
    <ProveedorTramite>
      <Routes>
        <Route element={<Diseno />}>
          <Route path="/" element={<Inicio />} />
          <Route path="/asistente" element={<Asistente />} />
          <Route path="/licencias/:codigo" element={<Licencia />} />
          <Route path="/ingresar" element={<Ingresar />} />
          <Route path="/consulta" element={<Consulta />} />
          <Route path="/tramite/identidad" element={<Identidad />} />
          <Route path="/tramite/solicitud" element={<Solicitud />} />
          <Route path="/tramite/comprobante/:numero" element={<Comprobante />} />
          <Route
            path="/admin/usuarios"
            element={
              <RutaProtegida roles={['ADMINISTRADOR']}>
                <Usuarios />
              </RutaProtegida>
            }
          />
          <Route
            path="/admin/catalogo"
            element={
              <RutaProtegida roles={['ADMINISTRADOR']}>
                <Catalogo />
              </RutaProtegida>
            }
          />
          <Route
            path="/admin/catalogo/:codigo"
            element={
              <RutaProtegida roles={['ADMINISTRADOR']}>
                <EditarReceta />
              </RutaProtegida>
            }
          />
          <Route
            path="/cambiar-clave"
            element={
              <RutaProtegida permitirClaveTemporal>
                <CambiarClave />
              </RutaProtegida>
            }
          />
        </Route>
      </Routes>
    </ProveedorTramite>
  );
}
