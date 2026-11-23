import { expect, test } from '@playwright/test';
import {
  comoPersonal,
  confirmarRiesgo,
  descargarLicencia,
  hoyLima,
  pagarEnCaja,
  presentarSolicitud,
} from './apoyo/recorridos';
import { ARCHIVOS, usuario } from './apoyo/sistema';

// Recorrido de la ruta B en el navegador (historia 3 de la 007): pago → inspección previa → la jefatura
// asigna → el inspector registra un resultado favorable con 2 fotos → licencia emitida. Datos FICTICIOS.

test('ruta B: de la solicitud a la licencia con inspección previa favorable', async ({
  page,
  browser,
}) => {
  const numero = await presentarSolicitud(page, 'Alto', 'LIC-03');

  const evaluador = await comoPersonal(browser, page, 'EVALUADOR');
  await confirmarRiesgo(evaluador, numero);
  const caja = await comoPersonal(browser, page, 'CAJA');
  await pagarEnCaja(caja, numero);

  const jefatura = await comoPersonal(browser, page, 'JEFATURA');
  const tarjeta = jefatura.getByRole('article', { name: `Inspección de ${numero}` });
  await expect(async () => {
    await jefatura.goto('/personal/inspecciones');
    await expect(tarjeta).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await tarjeta.getByRole('button', { name: 'Asignar' }).click();
  await tarjeta.getByLabel('Inspector').selectOption(usuario('INSPECTOR').id);
  await tarjeta.getByLabel('Fecha programada').fill(hoyLima());
  await tarjeta.getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(jefatura.getByRole('status').filter({ hasText: /asign/i })).toBeVisible();

  const inspector = await comoPersonal(browser, page, 'INSPECTOR');
  await inspector.goto('/personal/inspecciones');
  await inspector
    .getByRole('article', { name: `Inspección de ${numero}` })
    .getByRole('link', { name: 'Registrar resultado' })
    .click();
  await inspector.getByRole('radio', { name: 'Favorable', exact: true }).check();
  await inspector.getByLabel('Observaciones').fill('Local en orden, extintor vigente');
  await inspector.getByLabel('Número del certificado ITSE').fill(`ITSE-E2E-${numero.slice(-6)}`);
  await inspector.getByLabel('Fecha de emisión del certificado').fill(hoyLima());
  await inspector
    .getByLabel('Fotos (de 1 a 5, JPG o PNG)')
    .setInputFiles([ARCHIVOS.jpg('frente.jpg'), ARCHIVOS.jpg('extintor.jpg')]);
  await expect(
    inspector.getByRole('list', { name: 'Fotos elegidas' }).getByRole('listitem'),
  ).toHaveCount(2);
  await inspector.getByRole('button', { name: 'Registrar resultado' }).click();
  await expect(
    inspector.getByRole('status').filter({ hasText: 'Resultado registrado' }),
  ).toBeVisible();

  await descargarLicencia(page, numero);
});
