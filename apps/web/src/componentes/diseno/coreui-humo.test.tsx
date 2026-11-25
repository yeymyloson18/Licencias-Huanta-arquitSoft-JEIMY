import { CButton, CDropdown, CDropdownMenu, CDropdownToggle, CSidebar } from '@coreui/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { simularMedios } from '../../pruebas/medios';

// Prueba de humo de CoreUI en Jest (013, T005): los componentes que usa el diseño se montan en jsdom
// con el simulador de matchMedia, en escritorio y en celular.

describe('CoreUI en Jest (humo)', () => {
  it('monta un botón, un desplegable y el menú lateral en escritorio', () => {
    render(
      <>
        <CButton color="primary">Aceptar</CButton>
        <CDropdown>
          <CDropdownToggle>Opciones</CDropdownToggle>
          <CDropdownMenu>
            <li>Una</li>
          </CDropdownMenu>
        </CDropdown>
        <CSidebar visible>
          <nav aria-label="Menú de prueba">Contenido</nav>
        </CSidebar>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveClass('btn', 'btn-primary');
    expect(screen.getByRole('button', { name: 'Opciones' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menú de prueba' })).toBeInTheDocument();
  });

  it('monta el menú lateral en un celular sin errores', () => {
    simularMedios({ celular: true });

    render(
      <CSidebar visible={false}>
        <nav aria-label="Menú de prueba">Contenido</nav>
      </CSidebar>,
    );

    expect(document.querySelector('.sidebar')).not.toBeNull();
  });

  // CIcon 2.3.0 lee la variable global `process` cuando recibe `content` o `name` (propiedades
  // obsoletas). En Jest existe y no falla; en el navegador no existe y tira la pantalla. Solo se usa
  // `icon`.
  it('ningún CIcon usa las propiedades obsoletas content ni name', () => {
    const raiz = join(__dirname, '..', '..');
    const archivos = (readdirSync(raiz, { recursive: true }) as string[]).filter(
      (archivo) => archivo.endsWith('.tsx') && !archivo.endsWith('.test.tsx'),
    );
    const conObsoletas = archivos.filter((archivo) =>
      /<CIcon[^>]*\s(content|name)=/.test(readFileSync(join(raiz, archivo), 'utf8')),
    );

    expect(archivos.length).toBeGreaterThan(0);
    expect(conObsoletas).toEqual([]);
  });
});
