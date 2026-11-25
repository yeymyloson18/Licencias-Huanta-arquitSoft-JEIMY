import { expect, test } from '@playwright/test';

// Chat de orientación (012, US6): en el compose de E2E no hay clave del proveedor (las variables
// ORIENTACION_* están vacías por defecto), así que el chat responde NO_DISPONIBLE y ofrece el
// asistente. Nunca se llama al proveedor real. Si se corre en local, hacerlo sin la clave en
// infra/.env. En el proyecto `celular` (360×740) comprueba que no hay desplazamiento horizontal.

test('el chat de orientación se usa con teclado y orienta al asistente sin proveedor', async ({
  page,
}, info) => {
  await page.goto('/');
  const boton = page.getByRole('button', { name: 'Pregúntanos' });
  await boton.click();

  const dialogo = page.getByRole('dialog', { name: 'Pregúntanos sobre licencias' });
  const campo = dialogo.getByLabel('Escriba su pregunta');
  await expect(dialogo).toBeVisible();
  await expect(campo).toBeFocused();

  await campo.fill('¿Cuánto cuesta la licencia para una bodega?');
  await campo.press('Enter');
  await expect(dialogo.getByText(/En este momento no puedo responder preguntas/)).toBeVisible();
  await expect(dialogo.getByRole('link', { name: '¿Qué licencia necesito?' })).toBeVisible();

  if (info.project.name === 'celular') {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();

  await boton.click();
  await dialogo.getByRole('link', { name: '¿Qué licencia necesito?' }).click();
  await expect(page).toHaveURL(/\/asistente$/);

  await page.goto('/ingresar');
  await expect(page.getByLabel('Correo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pregúntanos' })).toHaveCount(0);
});
