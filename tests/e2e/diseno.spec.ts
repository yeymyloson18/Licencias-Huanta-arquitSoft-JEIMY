import { expect, type Page, test } from '@playwright/test';
import { ingresar, type Rol, vigilarCsp, violacionesCsp } from './apoyo/sistema';

// Diseño con CoreUI (013, T043): menú por rol, menú lateral a 360 px, primer pintado en el modo
// correcto, CSP, teclado del desplegable y corte de 768 px. Datos FICTICIOS.

const OPCIONES: Readonly<Record<Rol, readonly string[]>> = {
  ADMINISTRADOR: ['Panel', 'Usuarios', 'Catálogo', 'Feriados', 'Auditoría'],
  MESA_PARTES: ['Expedientes', 'Registrar solicitud'],
  EVALUADOR: ['Expedientes'],
  CAJA: ['Caja'],
  INSPECTOR: ['Inspecciones'],
  JEFATURA: ['Expedientes', 'Auditoría', 'Inspecciones', 'Alertas', 'Tablero'],
};

const sinDesplazamientoHorizontal = (pagina: Page): Promise<boolean> =>
  pagina.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

const FONDO_OSCURO = 'rgb(33, 38, 49)';
const FONDO_CLARO = 'rgb(255, 255, 255)';

test.describe('(a) menú del personal por rol (SC-007)', () => {
  for (const [rol, opciones] of Object.entries(OPCIONES) as [Rol, readonly string[]][]) {
    test(`${rol} ve exactamente sus opciones`, async ({ page }) => {
      await ingresar(page, rol);
      const menu = page.getByRole('navigation', { name: 'Menú del personal' });

      await expect(menu.getByRole('link')).toHaveText([...opciones]);
      expect(await violacionesCsp(page)).toEqual([]);
    });
  }
});

test('(b) a 360 px el botón abre y cierra el menú, sin desplazamiento horizontal', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'celular', 'Solo en el celular');
  await ingresar(page, 'JEFATURA');
  const menu = page.getByRole('navigation', { name: 'Menú del personal' });
  expect(await sinDesplazamientoHorizontal(page)).toBe(true);
  await expect(menu).not.toBeInViewport();

  await page.getByRole('button', { name: 'Mostrar menú' }).click();
  await expect(menu).toBeInViewport();
  expect(await sinDesplazamientoHorizontal(page)).toBe(true);

  // El menú abierto tapa el botón de la barra: se cierra con "Cerrar menú", dentro del menú.
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toBeFocused();
  await page.getByRole('button', { name: 'Cerrar menú' }).click();
  await expect(menu).not.toBeInViewport();
  await expect(page.getByRole('button', { name: 'Mostrar menú' })).toBeFocused();
  expect(await sinDesplazamientoHorizontal(page)).toBe(true);
  expect(await violacionesCsp(page)).toEqual([]);
});

test('(c) dispositivo oscuro y sin elección: el fondo es oscuro antes de que React monte (SC-006)', async ({
  browser,
}) => {
  const contexto = await browser.newContext({ colorScheme: 'dark' });
  await contexto.addInitScript(() => {
    const ventana = window as unknown as { __antesDeReact?: string };
    const medir = () => {
      const raiz = document.getElementById('raiz');
      // Al correr el script de inicio todavía no hay <body>.
      const cuerpo = document.body as HTMLElement | null;
      if (cuerpo && raiz && raiz.childElementCount === 0 && !ventana.__antesDeReact) {
        ventana.__antesDeReact = getComputedStyle(cuerpo).backgroundColor;
      }
      if (!ventana.__antesDeReact) {
        requestAnimationFrame(medir);
      }
    };
    requestAnimationFrame(medir);
  });
  const page = await contexto.newPage();
  await page.goto('/');
  await page.waitForFunction(
    () => (window as unknown as { __antesDeReact?: string }).__antesDeReact !== undefined,
  );

  expect(
    await page.evaluate(() => (window as unknown as { __antesDeReact: string }).__antesDeReact),
  ).toBe(FONDO_OSCURO);
  await contexto.close();
});

// (d) Elección guardada contraria al dispositivo (análisis U1): se registra el fondo en cada cuadro
// hasta que React monta. Este caso NO falla la prueba: anota si hubo destello, porque el plan B de
// research R-05 (un script externo en <head>) necesita la aprobación de la usuaria.
for (const [eleccion, dispositivo, esperado, contrario] of [
  ['claro', 'dark', FONDO_CLARO, FONDO_OSCURO],
  ['oscuro', 'light', FONDO_OSCURO, FONDO_CLARO],
] as const) {
  test(`(d) elección "${eleccion}" con el dispositivo en ${dispositivo}: ¿destello?`, async ({
    browser,
  }, info) => {
    const contexto = await browser.newContext({
      colorScheme: dispositivo,
      viewport: info.project.use.viewport ?? { width: 1280, height: 800 },
    });
    await contexto.addInitScript((modo) => {
      try {
        localStorage.setItem('licencias-modo-color', modo);
      } catch {
        // Sin almacenamiento no hay elección que medir.
      }
      const ventana = window as unknown as { __colores: string[] };
      ventana.__colores = [];
      const registrar = () => {
        const cuerpo = document.body as HTMLElement | null;
        if (cuerpo) {
          ventana.__colores.push(getComputedStyle(cuerpo).backgroundColor);
        }
        const raiz = document.getElementById('raiz');
        if (!raiz || raiz.childElementCount === 0) {
          requestAnimationFrame(registrar);
        }
      };
      requestAnimationFrame(registrar);
    }, eleccion);
    const page = await contexto.newPage();
    await page.goto('/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    const colores = await page.evaluate(
      () => (window as unknown as { __colores: string[] }).__colores,
    );
    const final = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const destello = colores.includes(contrario);
    test.info().annotations.push({
      type: destello ? 'destello' : 'sin destello',
      description: `${info.project.name}: cuadros ${colores.join(' | ')}; final ${final}`,
    });
    console.log(
      `DESTELLO ${info.project.name} ${eleccion}/${dispositivo}: ${destello ? 'sí' : 'no'} (${String(colores.length)} cuadros)`,
    );
    expect(final).toBe(esperado);
    await contexto.close();
  });
}

test('(e) las páginas públicas no tienen violaciones de la CSP', async ({ page }) => {
  await vigilarCsp(page);
  for (const ruta of ['/', '/asistente', '/consulta', '/ingresar']) {
    await page.goto(ruta);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForLoadState('networkidle');
    expect([ruta, await violacionesCsp(page)]).toEqual([ruta, []]);
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Pregúntanos' }).click();
  await page.getByRole('dialog', { name: 'Pregúntanos sobre licencias' }).waitFor();
  await page
    .getByRole('button', { name: /Cambiar a modo/ })
    .first()
    .click({ force: true });
  expect(await violacionesCsp(page)).toEqual([]);
});

test('(f) el desplegable del usuario se usa con el teclado', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'Solo en escritorio');
  await ingresar(page, 'CAJA');
  const boton = page.locator('.desplegable-usuario .dropdown-toggle');

  await boton.focus();
  await page.keyboard.press('Enter');
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  await expect(boton).toBeFocused();
});

test('(g) a 800 px el menú lateral se ve sin el botón; a 767 px está oculto y el botón lo abre', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'escritorio', 'Solo en escritorio');
  await page.setViewportSize({ width: 800, height: 800 });
  await ingresar(page, 'JEFATURA');
  const menu = page.getByRole('navigation', { name: 'Menú del personal' });
  await expect(menu).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Mostrar menú' })).toBeHidden();

  await page.setViewportSize({ width: 767, height: 800 });
  await expect(menu).not.toBeInViewport();
  await page.getByRole('button', { name: 'Mostrar menú' }).click();
  await expect(menu).toBeInViewport();
});
