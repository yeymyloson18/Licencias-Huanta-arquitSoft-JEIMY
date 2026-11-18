import { HasherClavesArgon2 } from '../../../../../src/modulos/seguridad/infraestructura/hasher-claves-argon2';

const hasher = new HasherClavesArgon2();

describe('HasherClavesArgon2', () => {
  it('produce una huella argon2id que no contiene la clave', async () => {
    const huella = await hasher.huella('ClaveSegura2026');

    expect(huella.startsWith('$argon2id$')).toBe(true);
    expect(huella).not.toContain('ClaveSegura2026');
  });

  it('verifica la clave correcta y rechaza otra', async () => {
    const huella = await hasher.huella('ClaveSegura2026');

    await expect(hasher.verificar('ClaveSegura2026', huella)).resolves.toBe(true);
    await expect(hasher.verificar('OtraClave2026', huella)).resolves.toBe(false);
  });

  it('una huella mal formada se trata como clave incorrecta', async () => {
    await expect(hasher.verificar('ClaveSegura2026', 'no-es-una-huella')).resolves.toBe(false);
  });

  it('verificarContraFicticia siempre devuelve false', async () => {
    await expect(hasher.verificarContraFicticia('ClaveSegura2026')).resolves.toBe(false);
    await expect(hasher.verificarContraFicticia('')).resolves.toBe(false);
  });
});
