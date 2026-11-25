import type { EnlaceOrientacion } from '../../servicios/clienteApi';

// Enlaces del chat de orientación (012): el portal los convierte en rutas internas con un mapa fijo.
// El servidor nunca manda direcciones web (contracts/portal-orientacion.md).

export interface EnlaceInterno {
  readonly ruta: string;
  readonly texto: string;
}

export const enlaceInterno = (enlace: EnlaceOrientacion): EnlaceInterno => {
  switch (enlace.tipo) {
    case 'FICHA':
      return enlace.codigoReceta
        ? {
            ruta: `/licencias/${enlace.codigoReceta}`,
            texto: `Ver la ficha de ${enlace.codigoReceta}`,
          }
        : { ruta: '/', texto: 'Ver la lista de licencias' };
    case 'ASISTENTE':
      return { ruta: '/asistente', texto: '¿Qué licencia necesito?' };
    case 'CONSULTA':
      return { ruta: '/consulta', texto: 'Consultar mi trámite' };
    case 'LICENCIAS':
      return { ruta: '/', texto: 'Ver la lista de licencias' };
  }
};

/** Rutas públicas del administrado donde aparece "Pregúntanos" (FR-001). */
const RUTAS_PUBLICAS = [
  /^\/$/,
  /^\/asistente$/,
  /^\/licencias\/[^/]+$/,
  /^\/consulta$/,
  /^\/verificar\/[^/]+$/,
  /^\/tramite\//,
];

export const esRutaPublica = (ruta: string): boolean =>
  RUTAS_PUBLICAS.some((patron) => patron.test(ruta));
