import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { RutasAplicacion } from './Aplicacion';
import { aplicarModoGuardado } from './sesion/modo-color';
import { ProveedorSesion } from './sesion/ProveedorSesion';
// 013: tema con CoreUI (colores de la Municipalidad); incluye global.css al final.
import './estilos/tema.scss';

// 013 (US6): la elección de modo guardada, antes de montar React. Sin elección, el CSS sigue al
// sistema desde el primer pintado (research R-05). Sin scripts en línea (CSP).
aplicarModoGuardado();

const contenedor = document.getElementById('raiz');
if (!contenedor) {
  throw new Error('No se encontró el contenedor #raiz');
}

createRoot(contenedor).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        <RutasAplicacion />
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>,
);
