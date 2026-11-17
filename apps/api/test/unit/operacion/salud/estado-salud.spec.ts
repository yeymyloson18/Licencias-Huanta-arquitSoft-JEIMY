import {
  calcularEstadoGeneral,
  codigoHttpPara,
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

describe('codigoHttpPara', () => {
  it.each<[EstadoGeneral, number]>([
    ['OK', 200],
    ['DEGRADADO', 200],
    ['CAIDO', 503],
  ])('%s → %i', (estado, codigo) => {
    expect(codigoHttpPara(estado)).toBe(codigo);
  });
});
