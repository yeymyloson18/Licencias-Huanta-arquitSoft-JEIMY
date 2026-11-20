import { defineConfig } from '@playwright/test';

// Pruebas de extremo a extremo de la 007 (criterio 6, research §R-11): recorridos completos de las
// rutas A y B en el navegador, contra el sistema levantado con infra/docker-compose.yml. Datos
// FICTICIOS. En local usa el Chrome instalado; en CI, el Chromium que instala Playwright.

const enCi = process.env.CI === 'true';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  globalSetup: './apoyo/preparacion-global.ts',
  // Los recorridos comparten la base: uno a la vez.
  workers: 1,
  fullyParallel: false,
  timeout: 4 * 60 * 1000,
  expect: { timeout: 20_000 },
  retries: enCi ? 1 : 0,
  reporter: enCi ? [['list'], ['html', { open: 'never', outputFolder: 'informe' }]] : 'list',
  outputDir: 'resultados',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:8080',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(enCi ? {} : { channel: 'chrome' }),
  },
  projects: [
    {
      name: 'celular',
      use: {
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'escritorio', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
