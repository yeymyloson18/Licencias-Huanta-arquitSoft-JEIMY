import { Outlet, Route, Routes, useLocation } from 'react-router';
import { RutaProtegida } from './componentes/RutaProtegida';
import { CambiarClave } from './paginas/CambiarClave';
import { Ingresar } from './paginas/Ingresar';
import { Inicio } from './paginas/Inicio';
import { useSesion } from './sesion/ProveedorSesion';

interface EstadoNavegacion {
  readonly aviso?: string;
}

/** Diseño común: muestra el aviso pendiente (cierre por inactividad, clave cambiada…). */
function Diseno() {
  const { aviso } = useSesion();
  const ubicacion = useLocation();
  const avisoNavegacion = (ubicacion.state as EstadoNavegacion | null)?.aviso;
  const mensaje = avisoNavegacion ?? aviso;

  return (
    <>
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
        <Route path="/ingresar" element={<Ingresar />} />
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
