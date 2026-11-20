import { EmisorTokensJwt } from '../../../../../src/modulos/seguridad/infraestructura/emisor-tokens-jwt';

const SECRETO = 'secreto-de-prueba-unitaria-con-mas-de-32-bytes';
const reclamos = {
  sub: '00000000-0000-4000-8000-0000000000aa',
  sid: '00000000-0000-4000-8000-0000000000bb',
  roles: ['CAJA' as const, 'JEFATURA' as const],
  vs: 3,
  dcc: false,
};

const cargaDe = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<
    string,
    unknown
  >;

describe('EmisorTokensJwt', () => {
  const emisor = new EmisorTokensJwt(SECRETO);

  it('firma y verifica los reclamos', async () => {
    const token = await emisor.firmarAcceso(reclamos);

    await expect(emisor.verificarAcceso(token)).resolves.toEqual(reclamos);
  });

  it('dura 15 minutos', async () => {
    const carga = cargaDe(await emisor.firmarAcceso(reclamos));

    expect(emisor.segundosDeVida).toBe(900);
    expect(Number(carga.exp) - Number(carga.iat)).toBe(900);
  });

  it('el token de identidad del administrado dura 30 minutos y el del personal sigue en 15', async () => {
    const carga = cargaDe(await emisor.firmarIdentidad('00000000-0000-4000-8000-0000000000cc'));

    expect(emisor.segundosDeVidaIdentidad).toBe(1800);
    expect(Number(carga.exp) - Number(carga.iat)).toBe(1800);
    expect(emisor.segundosDeVida).toBe(900);
  });

  it('no incluye datos personales: solo los reclamos y las fechas', async () => {
    const carga = cargaDe(await emisor.firmarAcceso(reclamos));

    expect(Object.keys(carga).sort()).toEqual(['dcc', 'exp', 'iat', 'roles', 'sid', 'sub', 'vs']);
  });

  it('rechaza una firma alterada, otro secreto y basura', async () => {
    const token = await emisor.firmarAcceso(reclamos);
    const [cabecera, carga] = token.split('.');
    const alterado = `${cabecera ?? ''}.${carga ?? ''}.firmaFalsa`;

    await expect(emisor.verificarAcceso(alterado)).resolves.toBeNull();
    await expect(new EmisorTokensJwt(`${SECRETO}-otro`).verificarAcceso(token)).resolves.toBeNull();
    await expect(emisor.verificarAcceso('no.es.jwt')).resolves.toBeNull();
  });

  it('rechaza un token vencido', async () => {
    const vencido = new EmisorTokensJwt(SECRETO, -10);

    await expect(emisor.verificarAcceso(await vencido.firmarAcceso(reclamos))).resolves.toBeNull();
  });

  it('rechaza reclamos con forma inválida', async () => {
    const raro = await emisor.firmarAcceso({ ...reclamos, roles: ['NO_EXISTE' as 'CAJA'] });

    await expect(emisor.verificarAcceso(raro)).resolves.toBeNull();
  });

  describe('tokenConsulta (005)', () => {
    it('lleva el número de expediente, audiencia propia y dura 15 minutos', async () => {
      const token = await emisor.firmarConsulta('EXP-2026-000001');
      const carga = cargaDe(token);

      await expect(emisor.verificarConsulta(token)).resolves.toBe('EXP-2026-000001');
      expect(carga.aud).toBe('consulta-expediente');
      expect(Number(carga.exp) - Number(carga.iat)).toBe(900);
      expect(emisor.segundosDeVidaConsulta).toBe(900);
    });

    it('no sirve como token del personal ni de identidad, ni al revés', async () => {
      const consulta = await emisor.firmarConsulta('EXP-2026-000001');

      await expect(emisor.verificarAcceso(consulta)).resolves.toBeNull();
      await expect(emisor.verificarIdentidad(consulta)).resolves.toBeNull();
      await expect(
        emisor.verificarConsulta(await emisor.firmarAcceso(reclamos)),
      ).resolves.toBeNull();
      await expect(
        emisor.verificarConsulta(await emisor.firmarIdentidad('verificacion-1')),
      ).resolves.toBeNull();
    });

    it('rechaza un sujeto que no es un número de expediente o una firma ajena', async () => {
      await expect(
        emisor.verificarConsulta(await emisor.firmarConsulta('otra-cosa')),
      ).resolves.toBeNull();
      const ajeno = new EmisorTokensJwt('otro-secreto-de-prueba-con-mas-de-32-bytes');
      await expect(
        emisor.verificarConsulta(await ajeno.firmarConsulta('EXP-2026-000001')),
      ).resolves.toBeNull();
    });
  });
});
