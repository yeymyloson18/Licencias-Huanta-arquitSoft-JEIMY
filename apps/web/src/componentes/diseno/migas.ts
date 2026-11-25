// Migas de pan del área del personal (013, FR-008; data-model.md). Se arman con un mapa FIJO de
// rutas: un tramo desconocido se omite, porque podría ser un identificador. Nunca muestran datos
// personales (ni el nombre, ni el correo, ni el id de un usuario); sí el número de expediente y el
// código de receta, que no lo son.

export interface Miga {
  readonly etiqueta: string;
  /** `null` en el último tramo (la pantalla actual). */
  readonly ruta: string | null;
}

const EXPEDIENTE = /^EXP-\d{4}-\d{6}$/;
const RECETA = /^[A-Z]{3}-\d{2}$/;

const FIJAS: Readonly<Record<string, string>> = {
  '/admin': 'Panel',
  '/admin/usuarios': 'Usuarios',
  '/admin/catalogo': 'Catálogo',
  '/admin/auditoria': 'Auditoría',
  '/admin/feriados': 'Feriados',
  '/personal/expedientes': 'Expedientes',
  '/personal/mesa-partes/nueva': 'Registrar solicitud',
  '/personal/caja': 'Caja',
  '/personal/inspecciones': 'Inspecciones',
  '/personal/tablero': 'Tablero',
  '/personal/alertas': 'Alertas',
  '/personal/auditoria': 'Auditoría',
  '/perfil': 'Mi perfil',
};

/** Etiqueta de cada ruta conocida, o `null` si ese tramo no se muestra. */
const etiquetaDe = (ruta: string): string | null => {
  const fija = FIJAS[ruta];
  if (fija !== undefined) {
    return fija;
  }
  const ultimo = ruta.split('/').at(-1) ?? '';
  if (/^\/admin\/usuarios\/[^/]+$/.test(ruta)) {
    return 'Ficha del usuario';
  }
  if (/^\/admin\/catalogo\/[^/]+$/.test(ruta)) {
    return RECETA.test(ultimo) ? ultimo : null;
  }
  if (/^\/personal\/expedientes\/[^/]+$/.test(ruta)) {
    return EXPEDIENTE.test(ultimo) ? ultimo : null;
  }
  if (/^\/personal\/inspecciones\/[^/]+\/resultado$/.test(ruta)) {
    return 'Resultado de la inspección';
  }
  return null;
};

export const migasDe = (pathname: string): Miga[] => {
  const tramos = pathname.split('/').filter((tramo) => tramo.length > 0);
  const migas: Miga[] = [];
  for (let fin = 1; fin <= tramos.length; fin += 1) {
    const ruta = `/${tramos.slice(0, fin).join('/')}`;
    const etiqueta = etiquetaDe(ruta);
    if (etiqueta !== null) {
      migas.push({ etiqueta, ruta });
    }
  }
  return migas.map((miga, indice) =>
    indice === migas.length - 1 ? { etiqueta: miga.etiqueta, ruta: null } : miga,
  );
};
