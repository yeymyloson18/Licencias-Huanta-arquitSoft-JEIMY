import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { RutasAplicacion } from './Aplicacion';
import { ProveedorSesion } from './sesion/ProveedorSesion';
import './estilos/global.css';

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
