import { grupoDe, mismoGrupo } from '../../../../../src/modulos/tramites/dominio/grupo-licencia';

describe('Grupos de licencias (FR-003 de la 005)', () => {
  it.each([
    [
      'bodega (ruta C)',
      { ruta: 'C' as const, esCesionario: false, esCorporativa: false },
      'BODEGA',
    ],
    [
      'corporativa',
      { ruta: 'B' as const, esCesionario: false, esCorporativa: true },
      'CORPORATIVA',
    ],
    ['cesionario', { ruta: 'A' as const, esCesionario: true, esCorporativa: false }, 'CESIONARIO'],
    [
      'establecimiento',
      { ruta: 'B' as const, esCesionario: false, esCorporativa: false },
      'ESTABLECIMIENTO',
    ],
    ['sin ruta', { ruta: null, esCesionario: false, esCorporativa: false }, 'ESTABLECIMIENTO'],
  ])('%s', (_, datos, grupo) => {
    expect(grupoDe(datos)).toBe(grupo);
  });

  it('solo es el mismo grupo si coinciden', () => {
    expect(mismoGrupo('ESTABLECIMIENTO', 'ESTABLECIMIENTO')).toBe(true);
    expect(mismoGrupo('ESTABLECIMIENTO', 'CESIONARIO')).toBe(false);
  });
});
