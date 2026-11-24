import { Outlet, Route, Routes, useLocation } from 'react-router';
import { Menu } from './componentes/Menu';
import { PiePagina } from './componentes/PiePagina';
import { RutaProtegida } from './componentes/RutaProtegida';
import { AuditoriaSeguridad } from './paginas/admin/AuditoriaSeguridad';
import { Catalogo } from './paginas/admin/Catalogo';
import { Panel } from './paginas/admin/Panel';
import { EditarReceta } from './paginas/admin/EditarReceta';
import { Usuarios } from './paginas/admin/Usuarios';
import { Asistente } from './paginas/Asistente';
import { CambiarClave } from './paginas/CambiarClave';
import { Consulta } from './paginas/Consulta';
import { Ingresar } from './paginas/Ingresar';
import { Inicio } from './paginas/Inicio';
import { Licencia } from './paginas/Licencia';
import { Auditoria } from './paginas/personal/Auditoria';
import { Feriados } from './paginas/admin/Feriados';
import { Alertas } from './paginas/personal/Alertas';
import { Caja } from './paginas/personal/Caja';
import { Tablero } from './paginas/personal/Tablero';
import { Inspecciones } from './paginas/personal/Inspecciones';
import { ResultadoInspeccion } from './paginas/personal/ResultadoInspeccion';
import { DetalleExpediente } from './paginas/personal/DetalleExpediente';
import { Expedientes } from './paginas/personal/Expedientes';
import { MesaPartes } from './paginas/personal/MesaPartes';
import { Comprobante } from './paginas/tramite/Comprobante';
import { Identidad } from './paginas/tramite/Identidad';
import { Solicitud } from './paginas/tramite/Solicitud';
import { Subsanar } from './paginas/tramite/Subsanar';
import { Verificar } from './paginas/Verificar';
import { useSesion } from './sesion/ProveedorSesion';
import { ProveedorMesaPartes } from './tramite/ContextoMesaPartes';
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
      <PiePagina />
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
      <ProveedorMesaPartes>
        <Routes>
          <Route element={<Diseno />}>
            <Route path="/" element={<Inicio />} />
            <Route path="/asistente" element={<Asistente />} />
            <Route path="/licencias/:codigo" element={<Licencia />} />
            <Route path="/ingresar" element={<Ingresar />} />
            <Route path="/consulta" element={<Consulta />} />
            <Route path="/verificar/:codigo" element={<Verificar />} />
            <Route path="/tramite/identidad" element={<Identidad />} />
            <Route path="/tramite/solicitud" element={<Solicitud />} />
            <Route path="/tramite/comprobante/:numero" element={<Comprobante />} />
            <Route path="/tramite/subsanar/:numero" element={<Subsanar />} />
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
              path="/admin"
              element={
                <RutaProtegida roles={['ADMINISTRADOR']}>
                  <Panel />
                </RutaProtegida>
              }
            />
            <Route
              path="/admin/auditoria"
              element={
                <RutaProtegida roles={['ADMINISTRADOR']}>
                  <AuditoriaSeguridad />
                </RutaProtegida>
              }
            />
            <Route
              path="/admin/feriados"
              element={
                <RutaProtegida roles={['ADMINISTRADOR']}>
                  <Feriados />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/tablero"
              element={
                <RutaProtegida roles={['JEFATURA']}>
                  <Tablero />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/alertas"
              element={
                <RutaProtegida roles={['JEFATURA']}>
                  <Alertas />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/inspecciones"
              element={
                <RutaProtegida roles={['JEFATURA', 'INSPECTOR']}>
                  <Inspecciones />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/inspecciones/:id/resultado"
              element={
                <RutaProtegida roles={['INSPECTOR']}>
                  <ResultadoInspeccion />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/auditoria"
              element={
                <RutaProtegida roles={['JEFATURA']}>
                  <Auditoria />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/caja"
              element={
                <RutaProtegida roles={['CAJA']}>
                  <Caja />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/expedientes"
              element={
                <RutaProtegida roles={['MESA_PARTES', 'EVALUADOR', 'JEFATURA']}>
                  <Expedientes />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/expedientes/:numero"
              element={
                <RutaProtegida roles={['MESA_PARTES', 'EVALUADOR', 'JEFATURA']}>
                  <DetalleExpediente />
                </RutaProtegida>
              }
            />
            <Route
              path="/personal/mesa-partes/nueva"
              element={
                <RutaProtegida roles={['MESA_PARTES']}>
                  <MesaPartes />
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
      </ProveedorMesaPartes>
    </ProveedorTramite>
  );
}
