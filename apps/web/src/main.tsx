import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Página provisional de la fase 1; la página de inicio del catálogo llega en la historia 3.
const contenedor = document.getElementById('raiz');
if (!contenedor) {
  throw new Error('No se encontró el contenedor #raiz');
}

createRoot(contenedor).render(
  <StrictMode>
    <h1>Licencias de funcionamiento – Municipalidad Provincial de Huanta</h1>
  </StrictMode>,
);
