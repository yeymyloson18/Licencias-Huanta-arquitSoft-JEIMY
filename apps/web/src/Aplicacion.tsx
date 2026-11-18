import { Outlet, Route, Routes, useLocation } from 'react-router';
import { Menu } from './componentes/Menu';
import { RutaProtegida } from './componentes/RutaProtegida';
import { Usuarios } from './paginas/admin/Usuarios';
import { Asistente } from './paginas/Asistente';
import { CambiarClave } from './paginas/CambiarClave';
import { Ingresar } from './paginas/Ingresar';
import { Inicio } from './paginas/Inicio';
import { Licencia } from './paginas/Licencia';
import { useSesion } from './sesion/ProveedorSesion';

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

/** Rutas del portal (contracts/portal-seguridad.md). Las usan main.tsx y las pruebas. */
export function RutasAplicacion() {
  return (
    <Routes>
      <Route element={<Diseno />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/asistente" element={<Asistente />} />
        <Route path="/licencias/:codigo" element={<Licencia />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route
          path="/admin/usuarios"
          element={
            <RutaProtegida roles={['ADMINISTRADOR']}>
              <Usuarios />
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
  );
}
