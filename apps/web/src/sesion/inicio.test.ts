import { destinoDespuesDeIngresar, inicioDe, PERMISOS_PANTALLA } from './inicio';

describe('inicioDe: pantalla principal según los roles (011, FR-012 a FR-014)', () => {
  it.each([
    [['ADMINISTRADOR'], '/admin'],
    [['MESA_PARTES'], '/personal/expedientes'],
    [['EVALUADOR'], '/personal/expedientes'],
    [['CAJA'], '/personal/caja'],
    [['INSPECTOR'], '/personal/inspecciones'],
    [['JEFATURA'], '/personal/tablero'],
    [['INSPECTOR', 'CAJA'], '/personal/caja'],
    [['JEFATURA', 'EVALUADOR'], '/personal/expedientes'],
    [['JEFATURA', 'ADMINISTRADOR'], '/admin'],
    [['CAJA', 'MESA_PARTES'], '/personal/expedientes'],
    [[], '/perfil'],
  ])('%j → %s', (roles, pantalla) => {
    expect(inicioDe(roles)).toBe(pantalla);
  });

  it('ignora un rol desconocido y usa el siguiente conocido', () => {
    expect(inicioDe(['OTRO', 'INSPECTOR'])).toBe('/personal/inspecciones');
    expect(inicioDe(['OTRO'])).toBe('/perfil');
  });
});

describe('destinoDespuesDeIngresar: regreso seguro, sin redirección abierta (011, FR-015)', () => {
  const caja = ['CAJA'];

  it.each<[string, unknown]>([
    ['doble barra', '//evil.example'],
    ['doble barra con ruta', '//evil.example/admin'],
    ['barra invertida', '/\\evil.example'],
    ['dirección https', 'https://evil.example'],
    ['esquema http con una barra', 'http:/evil.example'],
    ['javascript:', 'javascript:alert(1)'],
    ['barras codificadas', '/%2F%2Fevil.example'],
    ['subir de carpeta', '/admin/../..'],
    ['con consulta', '/personal/caja?x=1'],
    ['con fragmento', '/personal/caja#x'],
    ['con espacio', '/personal/caja/ x'],
    ['dominio sin barra', 'evil.example'],
    ['cadena vacía', ''],
    ['solo barra', '/'],
    ['ruta pública', '/consulta'],
    ['barra final', '/personal/caja/'],
    ['null', null],
    ['undefined', undefined],
    ['número', 42],
    ['objeto', {}],
    ['ruta permitida a otro rol', '/admin'],
    ['ruta de otro rol del personal', '/personal/tablero'],
  ])('rechaza %s y va a la pantalla del rol', (_caso, volverA) => {
    expect(destinoDespuesDeIngresar(volverA, caja)).toBe('/personal/caja');
  });

  it.each<[string, readonly string[]]>([
    ['/perfil', ['CAJA']],
    ['/perfil', []],
    ['/cambiar-clave', ['CAJA']],
    ['/personal/caja', ['CAJA']],
    ['/personal/expedientes/EXP-2026-000123', ['EVALUADOR']],
    ['/personal/mesa-partes/nueva', ['MESA_PARTES']],
    ['/admin/usuarios', ['ADMINISTRADOR']],
    ['/admin', ['ADMINISTRADOR']],
    ['/personal/inspecciones', ['JEFATURA']],
  ])('respeta %s con %j', (volverA, roles) => {
    expect(destinoDespuesDeIngresar(volverA, roles)).toBe(volverA);
  });

  it('el resultado de una inspección es solo del INSPECTOR', () => {
    const ruta = '/personal/inspecciones/abc-123/resultado';
    expect(destinoDespuesDeIngresar(ruta, ['INSPECTOR'])).toBe(ruta);
    expect(destinoDespuesDeIngresar(ruta, ['JEFATURA'])).toBe('/personal/tablero');
  });

  it('sin roles, cualquier destino distinto de /perfil o /cambiar-clave va a /perfil', () => {
    expect(destinoDespuesDeIngresar('/personal/caja', [])).toBe('/perfil');
    expect(destinoDespuesDeIngresar('//evil.example', [])).toBe('/perfil');
  });
});

describe('PERMISOS_PANTALLA cubre las rutas protegidas de Aplicacion.tsx', () => {
  // Copia de los `path` con <RutaProtegida> en Aplicacion.tsx; una ruta nueva se agrega aquí y en
  // PERMISOS_PANTALLA. Si falta, el regreso cae en la pantalla del rol (falla cerrado).
  const RUTAS_PROTEGIDAS = [
    '/perfil',
    '/cambiar-clave',
    '/admin',
    '/admin/usuarios',
    '/admin/usuarios/:id',
    '/admin/catalogo',
    '/admin/catalogo/:codigo',
    '/admin/auditoria',
    '/admin/feriados',
    '/personal/tablero',
    '/personal/alertas',
    '/personal/inspecciones',
    '/personal/inspecciones/:id/resultado',
    '/personal/auditoria',
    '/personal/caja',
    '/personal/expedientes',
    '/personal/expedientes/:numero',
    '/personal/mesa-partes/nueva',
  ];

  it.each(RUTAS_PROTEGIDAS)('%s tiene una regla de permisos', (ruta) => {
    const concreta = ruta.replace(/:[a-z]+/g, 'x1');
    expect(PERMISOS_PANTALLA.some((regla) => regla.patron.test(concreta))).toBe(true);
  });
});
