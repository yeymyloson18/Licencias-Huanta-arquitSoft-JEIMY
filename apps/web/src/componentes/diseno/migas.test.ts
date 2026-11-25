import { migasDe } from './migas';

// 013 (FR-008, data-model.md): migas de pan legibles y SIN datos personales (nunca el nombre, el
// correo ni el id de un usuario). Se permiten números de expediente y códigos de receta.

const etiquetas = (ruta: string) => migasDe(ruta).map((miga) => miga.etiqueta);

describe('migasDe', () => {
  it('arma el camino con nombres legibles y el último tramo sin enlace', () => {
    expect(migasDe('/admin/usuarios')).toEqual([
      { etiqueta: 'Panel', ruta: '/admin' },
      { etiqueta: 'Usuarios', ruta: null },
    ]);
  });

  it('la ficha de un usuario nunca muestra su id', () => {
    const migas = migasDe('/admin/usuarios/123e4567-e89b-42d3-a456-426614174000');

    expect(migas.map((m) => m.etiqueta)).toEqual(['Panel', 'Usuarios', 'Ficha del usuario']);
    expect(JSON.stringify(migas)).not.toContain('123e4567');
  });

  it('muestra el número de expediente y el código de receta', () => {
    expect(etiquetas('/personal/expedientes/EXP-2026-000123')).toEqual([
      'Expedientes',
      'EXP-2026-000123',
    ]);
    expect(etiquetas('/admin/catalogo/LIC-02')).toEqual(['Panel', 'Catálogo', 'LIC-02']);
  });

  it('el resultado de una inspección no muestra su id', () => {
    expect(etiquetas('/personal/inspecciones/abc-123/resultado')).toEqual([
      'Inspecciones',
      'Resultado de la inspección',
    ]);
  });

  it.each([
    ['/admin', ['Panel']],
    ['/admin/catalogo', ['Panel', 'Catálogo']],
    ['/admin/auditoria', ['Panel', 'Auditoría']],
    ['/admin/feriados', ['Panel', 'Feriados']],
    ['/personal/expedientes', ['Expedientes']],
    ['/personal/mesa-partes/nueva', ['Registrar solicitud']],
    ['/personal/caja', ['Caja']],
    ['/personal/inspecciones', ['Inspecciones']],
    ['/personal/tablero', ['Tablero']],
    ['/personal/alertas', ['Alertas']],
    ['/personal/auditoria', ['Auditoría']],
    ['/perfil', ['Mi perfil']],
  ])('%s → %j', (ruta, esperado) => {
    expect(etiquetas(ruta)).toEqual(esperado);
  });

  it('omite los tramos desconocidos o que no tienen la forma esperada', () => {
    expect(etiquetas('/personal/expedientes/persona@correo.pe')).toEqual(['Expedientes']);
    expect(etiquetas('/admin/catalogo/no-es-codigo')).toEqual(['Panel', 'Catálogo']);
    expect(etiquetas('/personal/otra-cosa')).toEqual([]);
  });

  it('cada tramo intermedio enlaza a su ruta', () => {
    expect(migasDe('/personal/expedientes/EXP-2026-000123')).toEqual([
      { etiqueta: 'Expedientes', ruta: '/personal/expedientes' },
      { etiqueta: 'EXP-2026-000123', ruta: null },
    ]);
  });
});
