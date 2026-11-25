import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, test } from '@playwright/test';
import { ingresar, type Rol } from './apoyo/sistema';

// Capturas de antes y después del diseño con CoreUI (013, SC-008; tasks T001). Solo corre con
// CAPTURAS=antes o CAPTURAS=despues y nunca en CI. Las capturas "antes" son solo en modo claro
// (antes de la 013 no existe modo oscuro); las "después", en claro y oscuro. Datos FICTICIOS del
// sistema de demostración, en el compose aislado de medición.

const etapa = process.env.CAPTURAS;
const RAIZ = join(__dirname, '..', '..');

test.skip(etapa !== 'antes' && etapa !== 'despues', 'Solo con CAPTURAS=antes|despues');
test.skip(process.env.CI === 'true', 'Las capturas no corren en CI');
// Sin video ni traza: no hacen falta para las capturas (y el video necesita ffmpeg).
test.use({ video: 'off', trace: 'off' });

const modos = etapa === 'despues' ? (['claro', 'oscuro'] as const) : (['claro'] as const);

interface Pantalla {
  readonly nombre: string;
  readonly rol?: Rol;
  readonly abrir: (pagina: Page) => Promise<void>;
}

const PANTALLAS: readonly Pantalla[] = [
  {
    nombre: 'portada',
    abrir: async (pagina) => {
      await pagina.goto('/');
      await pagina.getByRole('heading', { level: 1 }).waitFor();
    },
  },
  {
    nombre: 'chat',
    abrir: async (pagina) => {
      await pagina.goto('/');
      await pagina.getByRole('button', { name: 'Pregúntanos' }).click();
      await pagina.getByRole('dialog', { name: 'Pregúntanos sobre licencias' }).waitFor();
    },
  },
  {
    nombre: 'ingresar',
    abrir: async (pagina) => {
      await pagina.goto('/ingresar');
      await pagina.getByLabel('Correo').waitFor();
    },
  },
  {
    nombre: 'bandeja',
    rol: 'EVALUADOR',
    abrir: async (pagina) => {
      await pagina.goto('/personal/expedientes');
      await pagina.getByRole('heading', { level: 1 }).waitFor();
      await pagina.waitForLoadState('networkidle');
    },
  },
  {
    nombre: 'tablero',
    rol: 'JEFATURA',
    abrir: async (pagina) => {
      await pagina.goto('/personal/tablero');
      await pagina.getByRole('heading', { level: 1 }).waitFor();
      await pagina.waitForLoadState('networkidle');
    },
  },
  {
    nombre: 'panel',
    rol: 'ADMINISTRADOR',
    abrir: async (pagina) => {
      await pagina.goto('/admin');
      await pagina.getByRole('heading', { level: 1 }).waitFor();
      await pagina.waitForLoadState('networkidle');
    },
  },
];

for (const modo of modos) {
  for (const pantalla of PANTALLAS) {
    test(`captura ${String(etapa)} ${modo}: ${pantalla.nombre}`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: modo === 'oscuro' ? 'dark' : 'light' });
      if (pantalla.rol !== undefined) {
        await ingresar(page, pantalla.rol);
      }
      await pantalla.abrir(page);
      const carpeta = join(
        RAIZ,
        'docs',
        '08-sprint-2',
        'evidencias',
        'diseno-013',
        String(etapa),
        modo,
      );
      mkdirSync(carpeta, { recursive: true });
      await page.screenshot({
        path: join(carpeta, `${info.project.name}-${pantalla.nombre}.png`),
        fullPage: true,
      });
    });
  }
}
