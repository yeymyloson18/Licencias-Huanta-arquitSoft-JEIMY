import {
  calcularEstadoGeneral,
  type EstadoDependencia,
  type EstadoGeneral,
} from '../../../../src/operacion/salud/dominio/estado-salud';

// Tabla de data-model.md §2.
describe('calcularEstadoGeneral', () => {
  it.each<[EstadoDependencia, EstadoDependencia, EstadoGeneral]>([
    ['OK', 'OK', 'OK'],
    ['OK', 'CAIDO', 'DEGRADADO'],
    ['CAIDO', 'OK', 'CAIDO'],
    ['CAIDO', 'CAIDO', 'CAIDO'],
  ])('base %s + caché %s → %s', (baseDeDatos, cache, esperado) => {
    expect(calcularEstadoGeneral(baseDeDatos, cache)).toBe(esperado);
  });
});
