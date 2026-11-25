import { contraste, PAREJAS } from './paleta';

// 013 (FR-024, SC-004): contraste WCAG de las parejas del tema en modo claro y oscuro. Texto: 4.5:1;
// componentes de interfaz (foco, bordes de control): 3:1. Los colores de paleta.ts se comparan con
// el CSS compilado en estilos/tema.test.ts (T039), así no hay dos fuentes que se desincronicen.

describe('contraste del tema', () => {
  it.each(PAREJAS.map((pareja) => [pareja.nombre, pareja] as const))('%s', (_nombre, pareja) => {
    expect(contraste(pareja.frente, pareja.fondo)).toBeGreaterThanOrEqual(pareja.minimo);
  });

  it('calcula el contraste con la fórmula de WCAG', () => {
    expect(contraste({ hex: '#000000' }, { hex: '#ffffff' })).toBeCloseTo(21, 1);
    expect(contraste({ hex: '#ffffff' }, { hex: '#ffffff' })).toBeCloseTo(1, 5);
    // Un color con transparencia se mezcla con el fondo antes de medir.
    expect(contraste({ hex: '#000000', alfa: 0 }, { hex: '#ffffff' })).toBeCloseTo(1, 5);
  });

  it('el foco amarillo solo NO llega a 3:1 sobre blanco: por eso en modo claro lleva anillo doble', () => {
    expect(contraste({ hex: '#f2a900' }, { hex: '#ffffff' })).toBeLessThan(3);
  });
});
