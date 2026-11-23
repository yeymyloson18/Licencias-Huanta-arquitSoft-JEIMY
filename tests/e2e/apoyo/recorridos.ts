import { type Browser, expect, type Page } from '@playwright/test';
import {
  aislarLimitesDePrueba,
  ARCHIVOS,
  hoyLima,
  ingresar,
  leerOtp,
  type Rol,
  URL_BASE,
} from './sistema';

// Pasos comunes de los recorridos de extremo a extremo (007). Titular FICTICIO que reconoce el servicio
// de identificación simulado de la 004.
export const TITULAR = {
  documento: '40000001',
  fechaEmision: '2020-01-15',
  ruc: '10400000011',
  nombre: 'Titular de Prueba Uno',
};

/**
 * Celular ficticio distinto en cada solicitud: el sistema solo envía 3 códigos por celular cada 15
 * minutos (004), y los recorridos, sus reintentos y los dos tamaños de pantalla piden más.
 */
let envios = 0;
const celularNuevo = (): string => {
  envios += 1;
  const sufijo = ((Date.now() + envios * 7919 + process.pid) % 100_000_000).toString();
  return `9${sufijo.padStart(8, '0')}`;
};

/** Una página nueva en un contexto propio (otra persona, otro celular), con el mismo tamaño. */
export const otraPersona = async (navegador: Browser, base: Page): Promise<Page> => {
  const contexto = await navegador.newContext({
    baseURL: URL_BASE,
    viewport: base.viewportSize(),
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  });
  return contexto.newPage();
};

export const comoPersonal = async (navegador: Browser, base: Page, rol: Rol): Promise<Page> => {
  const pagina = await otraPersona(navegador, base);
  await ingresar(pagina, rol);
  return pagina;
};

const fijarFecha = async (pagina: Page, selector: string, valor: string) => {
  await pagina.locator(selector).fill(valor);
};

/** Asistente → identidad con código → solicitud con documentos → comprobante. Devuelve el número. */
export const presentarSolicitud = async (
  pagina: Page,
  nivelRiesgo: 'Medio' | 'Alto',
  codigoEsperado: string,
): Promise<string> => {
  aislarLimitesDePrueba();
  await pagina.goto('/asistente');
  for (const opcion of ['Otro negocio', 'No', nivelRiesgo]) {
    await pagina.getByRole('radio', { name: opcion, exact: true }).check();
    await pagina.getByRole('button', { name: 'Siguiente' }).click();
  }
  await expect(
    pagina.getByRole('heading', { name: 'Esta es la licencia que te corresponde' }),
  ).toBeVisible();
  await pagina.getByRole('link', { name: 'Presentar solicitud' }).click();
  await expect(pagina).toHaveURL(new RegExp(`licencia=${codigoEsperado}`));

  await pagina.getByLabel('Número de documento').fill(TITULAR.documento);
  await fijarFecha(pagina, 'input[type=date]', TITULAR.fechaEmision);
  await pagina.getByLabel('RUC').fill(TITULAR.ruc);
  await pagina.getByLabel('Celular').fill(celularNuevo());
  const respuesta = pagina.waitForResponse((r) => r.url().endsWith('/identidad/verificar'));
  await pagina.getByRole('button', { name: 'Enviar código' }).click();
  const { desafioId } = (await (await respuesta).json()) as { desafioId: string };
  await pagina.getByLabel('Código de verificación').fill(await leerOtp(desafioId));
  await pagina.getByRole('button', { name: 'Confirmar' }).click();

  await expect(pagina.getByRole('group', { name: 'Documentos' })).toBeVisible();
  await pagina.getByLabel('Nombre completo del titular').fill(TITULAR.nombre);
  await pagina.getByLabel('Giro', { exact: true }).fill('Bodega');
  await pagina.getByLabel('Dirección').fill('Jr. Ficticio 123, Huanta');
  await pagina.getByLabel('Zona').fill('Centro');
  await pagina.getByLabel('Área del local en m²').fill('40');
  const obligatorios = pagina.locator('li.documento').filter({ hasText: 'Obligatorio' });
  const cantidad = await obligatorios.count();
  for (let i = 0; i < cantidad; i += 1) {
    await obligatorios.nth(i).locator('input[type=file]').setInputFiles(ARCHIVOS.pdf);
    await expect(pagina.locator('.documento__estado').filter({ hasText: /^Listo/ })).toHaveCount(
      i + 1,
    );
  }
  await pagina.getByRole('button', { name: 'Presentar solicitud' }).click();
  await expect(pagina.getByText('Solicitud presentada')).toBeVisible();
  const numero = (await pagina.locator('.comprobante__numero').textContent())?.trim() ?? '';
  expect(numero).toMatch(/^EXP-\d{4}-\d{6}$/);
  return numero;
};

/** Evaluador: empezar revisión y confirmar el riesgo (genera la esquela). */
export const confirmarRiesgo = async (evaluador: Page, numero: string): Promise<void> => {
  await evaluador.goto(`/personal/expedientes/${numero}`);
  await evaluador.getByRole('button', { name: 'Empezar revisión' }).click();
  await evaluador.getByRole('button', { name: 'Confirmar riesgo' }).click();
  await evaluador.getByRole('button', { name: 'Confirmar y generar esquela' }).click();
  await expect(
    evaluador.getByRole('status').filter({ hasText: 'Decisión guardada' }),
  ).toBeVisible();
};

/** Caja: busca la esquela (que genera la cola de eventos) y registra el recibo. */
export const pagarEnCaja = async (caja: Page, numero: string): Promise<void> => {
  await caja.goto('/personal/caja');
  await expect(async () => {
    await caja.getByLabel('Código de la esquela').fill(`ESQ-${numero}`);
    await caja.getByRole('button', { name: 'Buscar' }).click();
    await expect(caja.getByLabel('Número de recibo')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await caja.getByLabel('Número de recibo').fill(`REC-${numero.slice(-6)}`);
  await caja.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(caja.getByRole('region', { name: 'Pago registrado' })).toBeVisible();
};

/** Consulta pública: espera a que el expediente tenga licencia y la descarga en PDF. */
export const descargarLicencia = async (pagina: Page, numero: string): Promise<void> => {
  await expect(async () => {
    await pagina.goto('/consulta');
    await pagina.getByLabel('Número de expediente').fill(numero);
    await pagina.getByLabel('DNI, carné de extranjería o RUC del titular').fill(TITULAR.documento);
    await pagina.getByRole('button', { name: 'Consultar' }).click();
    await expect(pagina.getByRole('button', { name: 'Descargar licencia' })).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 60_000 });
  const descarga = pagina.waitForEvent('download');
  await pagina.getByRole('button', { name: 'Descargar licencia' }).click();
  expect((await descarga).suggestedFilename()).toMatch(/^LF-\d{4}-\d{6}\.pdf$/);
};

export { hoyLima };
