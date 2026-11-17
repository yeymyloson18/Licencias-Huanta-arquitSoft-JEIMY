import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Inicio } from './paginas/Inicio';
import './estilos/global.css';

const contenedor = document.getElementById('raiz');
if (!contenedor) {
  throw new Error('No se encontró el contenedor #raiz');
}

createRoot(contenedor).render(
  <StrictMode>
    <Inicio />
  </StrictMode>,
);
