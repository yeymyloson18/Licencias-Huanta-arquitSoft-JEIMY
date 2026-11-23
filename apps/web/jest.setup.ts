import '@testing-library/jest-dom';

// Constante que Vite reemplaza al compilar (vite.config.ts): en las pruebas, la documentación está activa.
(globalThis as unknown as { __DOCS_API__: boolean }).__DOCS_API__ = true;
