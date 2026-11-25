// Colores del tema para medir el contraste (013, FR-024 y SC-004). MANTENER IGUALES a
// _variables-municipalidad.scss y a los valores que publica CoreUI con ese tema: estilos/tema.test.ts
// (T039) los compara con el CSS compilado. Los valores con alfa se mezclan con su fondo.

export interface Color {
  readonly hex: string;
  /** Opacidad (0 a 1); por defecto, 1. */
  readonly alfa?: number;
}

export interface Pareja {
  readonly nombre: string;
  readonly frente: Color;
  readonly fondo: Color;
  /** 4.5 para texto; 3 para componentes de interfaz (foco, bordes de control). */
  readonly minimo: number;
}

export const COLORES = {
  primario: { hex: '#0b5394' },
  primarioOscuro: { hex: '#083d6d' },
  foco: { hex: '#f2a900' },
  blanco: { hex: '#ffffff' },
  claro: {
    fondo: { hex: '#ffffff' },
    fondoTerciario: { hex: '#f3f4f7' },
    texto: { hex: '#252b36', alfa: 0.95 },
    textoSuave: { hex: '#252b36', alfa: 0.681 },
    enlace: { hex: '#0b5394' },
  },
  oscuro: {
    fondo: { hex: '#212631' },
    fondoTerciario: { hex: '#2a303d' },
    texto: { hex: '#ffffff', alfa: 0.87 },
    textoSuave: { hex: '#ffffff', alfa: 0.6 },
    // Tinte claro del primario (research R-07): el #0b5394 sobre fondo oscuro no llega a 4.5:1.
    enlace: { hex: '#9dbad4' },
  },
} as const;

const canales = (hex: string): [number, number, number] => {
  const limpio = hex.replace('#', '');
  return [
    parseInt(limpio.slice(0, 2), 16),
    parseInt(limpio.slice(2, 4), 16),
    parseInt(limpio.slice(4, 6), 16),
  ];
};

const lineal = (canal: number): number => {
  const c = canal / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminancia = ([r, g, b]: readonly [number, number, number]): number =>
  0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);

/** Contraste WCAG entre un color (con su alfa mezclado sobre el fondo) y su fondo. */
export const contraste = (frente: Color, fondo: Color): number => {
  const base = canales(fondo.hex);
  const propio = canales(frente.hex);
  const alfa = frente.alfa ?? 1;
  const mezcla: [number, number, number] = [
    propio[0] * alfa + base[0] * (1 - alfa),
    propio[1] * alfa + base[1] * (1 - alfa),
    propio[2] * alfa + base[2] * (1 - alfa),
  ];
  const a = luminancia(mezcla);
  const b = luminancia(base);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const { claro, oscuro } = COLORES;

export const PAREJAS: readonly Pareja[] = [
  { nombre: 'claro: texto sobre el fondo', frente: claro.texto, fondo: claro.fondo, minimo: 4.5 },
  {
    nombre: 'claro: texto suave sobre el fondo terciario',
    frente: claro.textoSuave,
    fondo: claro.fondoTerciario,
    minimo: 4.5,
  },
  { nombre: 'claro: enlace sobre el fondo', frente: claro.enlace, fondo: claro.fondo, minimo: 4.5 },
  {
    nombre: 'claro: enlace sobre el fondo terciario',
    frente: claro.enlace,
    fondo: claro.fondoTerciario,
    minimo: 4.5,
  },
  {
    nombre: 'botón primario: blanco sobre #0b5394',
    frente: COLORES.blanco,
    fondo: COLORES.primario,
    minimo: 4.5,
  },
  {
    nombre: 'botón primario al pasar: blanco sobre #083d6d',
    frente: COLORES.blanco,
    fondo: COLORES.primarioOscuro,
    minimo: 4.5,
  },
  // Foco en modo claro: anillo doble. El anillo interior #083d6d contrasta con el fondo blanco y el
  // contorno #f2a900 contrasta con ese anillo (el #f2a900 solo, sobre blanco, da 2.0:1).
  {
    nombre: 'claro: anillo interior del foco (#083d6d) sobre el fondo',
    frente: COLORES.primarioOscuro,
    fondo: claro.fondo,
    minimo: 3,
  },
  {
    nombre: 'claro: contorno del foco (#f2a900) sobre el anillo interior',
    frente: COLORES.foco,
    fondo: COLORES.primarioOscuro,
    minimo: 3,
  },
  {
    nombre: 'oscuro: texto sobre el fondo',
    frente: oscuro.texto,
    fondo: oscuro.fondo,
    minimo: 4.5,
  },
  {
    nombre: 'oscuro: texto suave sobre el fondo terciario',
    frente: oscuro.textoSuave,
    fondo: oscuro.fondoTerciario,
    minimo: 4.5,
  },
  {
    nombre: 'oscuro: enlace sobre el fondo',
    frente: oscuro.enlace,
    fondo: oscuro.fondo,
    minimo: 4.5,
  },
  {
    nombre: 'oscuro: enlace sobre el fondo terciario',
    frente: oscuro.enlace,
    fondo: oscuro.fondoTerciario,
    minimo: 4.5,
  },
  {
    nombre: 'oscuro: foco (#f2a900) sobre el fondo',
    frente: COLORES.foco,
    fondo: oscuro.fondo,
    minimo: 3,
  },
];
