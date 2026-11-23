import { expect, test } from '@playwright/test';
import {
  comoPersonal,
  confirmarRiesgo,
  descargarLicencia,
  otraPersona,
  pagarEnCaja,
  presentarSolicitud,
} from './apoyo/recorridos';
import { codigoVerificacion } from './apoyo/sistema';

// Recorrido completo de la ruta A en el navegador (criterio 6, historia 3 de la 007): el administrado
// presenta, el evaluador confirma el riesgo, caja cobra, el evaluador aprueba, se emite la licencia y
// cualquier persona la verifica con el QR. Datos FICTICIOS.

test('ruta A: del asistente a la verificación pública de la licencia', async ({
  page,
  browser,
}) => {
  const numero = await presentarSolicitud(page, 'Medio', 'LIC-02');

  const evaluador = await comoPersonal(browser, page, 'EVALUADOR');
  await confirmarRiesgo(evaluador, numero);

  const caja = await comoPersonal(browser, page, 'CAJA');
  await pagarEnCaja(caja, numero);

  await expect(async () => {
    await evaluador.goto(`/personal/expedientes/${numero}`);
    await expect(evaluador.getByRole('button', { name: 'Aprobar' })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await evaluador.getByRole('button', { name: 'Aprobar' }).click();
  await expect(
    evaluador.getByRole('status').filter({ hasText: 'Decisión guardada' }),
  ).toBeVisible();

  await descargarLicencia(page, numero);

  const cualquiera = await otraPersona(browser, page);
  await cualquiera.goto(`/verificar/${codigoVerificacion(numero)}`);
  await expect(cualquiera.getByRole('heading', { name: /^LF-\d{4}-\d{6}$/ })).toBeVisible();
  await expect(cualquiera.getByText('Licencia vigente')).toBeVisible();
  await expect(cualquiera.getByText('Titular D. P. U.')).toBeVisible();
  await expect(cualquiera.getByText('40000001')).toHaveCount(0);
});
