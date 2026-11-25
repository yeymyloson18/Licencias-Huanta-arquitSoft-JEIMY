// Iconos del diseño (013, research R-01) para CIcon de @coreui/icons-react: [tamaño del lienzo,
// contenido SVG]. Son trazos propios y simples (no se copian los de @coreui/icons). Se dibujan con
// currentColor, así siguen el color del texto en ambos modos.

export type Icono = [string, string];

const trazo = (contenido: string): Icono => [
  '24 24',
  `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${contenido}</g>`,
];

/** Tres líneas: mostrar u ocultar el menú lateral. */
export const iconoMenu = trazo('<path d="M4 6h16M4 12h16M4 18h16"/>');

/** Persona: el desplegable del usuario. */
export const iconoUsuario = trazo(
  '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
);

/** Sol: modo claro. */
export const iconoSol = trazo(
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
);

/** Luna: modo oscuro. */
export const iconoLuna = trazo('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>');

/** Equis: cerrar. */
export const iconoCerrar = trazo('<path d="M6 6l12 12M18 6L6 18"/>');
