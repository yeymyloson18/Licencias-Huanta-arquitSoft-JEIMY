import { screen, waitFor } from '@testing-library/react';
import { simularApi } from '../../pruebas/api-simulada';
import { montarEn } from '../../pruebas/montar';

// "Pregúntanos" aparece solo en las páginas públicas del administrado (012, FR-001). Se monta el
// portal completo, como Inicio.test.tsx de la 011. Las rutas de la API no simuladas responden 404.

describe('Montaje del chat de orientación (US6)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['/', '/asistente', '/licencias/LIC-01', '/consulta', '/tramite/identidad'])(
    'aparece en la página pública %s',
    async (ruta) => {
      simularApi({});
      montarEn(ruta);

      expect(await screen.findByRole('button', { name: 'Pregúntanos' })).toBeInTheDocument();
    },
  );

  it.each(['/ingresar', '/perfil', '/cambiar-clave', '/admin', '/personal/caja'])(
    'no aparece en la pantalla del personal %s',
    async (ruta) => {
      simularApi({});
      montarEn(ruta);

      await waitFor(() => {
        expect(document.body.textContent).not.toBe('');
      });
      expect(screen.queryByRole('button', { name: 'Pregúntanos' })).not.toBeInTheDocument();
    },
  );
});
