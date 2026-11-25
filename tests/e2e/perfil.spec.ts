import { expect, type Page, test } from '@playwright/test';
import { guardarClave, ingresar, usuario } from './apoyo/sistema';

// Mi perfil y pantalla de inicio por rol (011): CAJA llega a Caja, ve su perfil y cambia su clave
// desde ahí. En el proyecto `celular` (360×740) comprueba que no hay desplazamiento horizontal
// (FR-018). Datos FICTICIOS.

const sinDesplazamientoHorizontal = (pagina: Page): Promise<boolean> =>
  pagina.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

test('CAJA llega a Caja, ve Mi perfil y cambia su clave', async ({ page }, info) => {
  const enCelular = info.project.name === 'celular';

  await ingresar(page, 'CAJA');
  await expect(page).toHaveURL(/\/personal\/caja$/);

  const menu = page.getByRole('navigation', { name: 'Menú del personal' });
  await expect(menu.getByRole('link', { name: 'Inicio' })).toHaveCount(0);
  // 013 (R-11): "Mi perfil" está en el desplegable del nombre, en la barra.
  const desplegable = page.locator('.desplegable-usuario');
  await desplegable.getByRole('button').click();
  await desplegable.getByRole('link', { name: 'Mi perfil' }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeVisible();
  const datos = page.getByRole('region', { name: 'Mis datos' });
  await expect(datos.getByText(usuario('CAJA').correo)).toBeVisible();
  await expect(datos.getByText(/^\d\*{5}\d{3}$/)).toBeVisible();
  await expect(datos.getByText('Caja', { exact: true })).toBeVisible();
  if (enCelular) {
    // Con el menú del personal a mano (FR-018). 013 (R-11): a 360 px se abre con "Mostrar menú" y
    // queda en la pantalla; con Escape se vuelve a cerrar.
    await page.getByRole('button', { name: 'Mostrar menú' }).click();
    await expect(menu).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Mostrar menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(await sinDesplazamientoHorizontal(page)).toBe(true);
  }

  await datos.getByRole('link', { name: 'Cambiar mi clave' }).click();
  await expect(page).toHaveURL(/\/cambiar-clave$/);
  await expect(page.getByRole('link', { name: 'Volver a mi perfil' })).toBeVisible();

  // Primero, claves nuevas distintas: el error queda visible junto al campo.
  const claveActual = usuario('CAJA').clave;
  const claveNueva = `PerfilE2e${Date.now().toString()}`;
  await page.getByLabel('Clave actual', { exact: true }).fill(claveActual);
  await page.getByLabel('Clave nueva', { exact: true }).fill(claveNueva);
  await page.getByLabel('Repetir clave nueva', { exact: true }).fill(`${claveNueva}x`);
  await page.getByRole('button', { name: 'Cambiar clave' }).click();
  await expect(page.getByText('Las claves nuevas no coinciden')).toBeVisible();
  if (enCelular) {
    expect(await sinDesplazamientoHorizontal(page)).toBe(true);
  }

  await page.getByLabel('Repetir clave nueva', { exact: true }).fill(claveNueva);
  await page.getByRole('button', { name: 'Cambiar clave' }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  // Desde aquí los demás recorridos ingresan con la clave nueva.
  guardarClave('CAJA', claveNueva);
  await expect(page.getByRole('status').filter({ hasText: 'Su clave se cambió' })).toBeVisible();
  // El cambio cierra las demás sesiones: solo queda esta.
  await expect(page.getByText('1 sesión abierta')).toBeVisible();
});
