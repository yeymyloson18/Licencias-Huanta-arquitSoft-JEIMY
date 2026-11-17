import type { EstadoGeneral } from '../../../../src/operacion/salud/dominio/estado-salud';
import { codigoHttpPara } from '../../../../src/operacion/salud/presentacion/codigo-http';

// Columna HTTP de la tabla de data-model.md §2 (contracts/salud.md).
describe('codigoHttpPara', () => {
  it.each<[EstadoGeneral, number]>([
    ['OK', 200],
    ['DEGRADADO', 200],
    ['CAIDO', 503],
  ])('%s → %i', (estado, codigo) => {
    expect(codigoHttpPara(estado)).toBe(codigo);
  });
});
