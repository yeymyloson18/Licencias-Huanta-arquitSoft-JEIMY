import '@testing-library/jest-dom';

// Constante que Vite reemplaza al compilar (vite.config.ts): en las pruebas, la documentación está activa.
(globalThis as unknown as { __DOCS_API__: boolean }).__DOCS_API__ = true;

// 013 (análisis C1): jsdom no trae window.matchMedia, que usan el modo de color y el menú lateral de
// CoreUI. Por defecto responde modo claro y escritorio; una prueba lo cambia con simularMedios().
import { instalarMatchMedia, reiniciarMedios } from './src/pruebas/medios';

instalarMatchMedia();
afterEach(() => {
  reiniciarMedios();
});
