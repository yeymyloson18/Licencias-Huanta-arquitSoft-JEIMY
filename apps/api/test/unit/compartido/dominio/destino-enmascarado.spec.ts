import {
  enmascararCelular,
  enmascararCorreo,
  enmascararDestino,
} from '../../../../src/compartido/dominio/destino-enmascarado';

describe('Destino enmascarado del buzón (009)', () => {
  it('celular: primer dígito y los 3 últimos', () => {
    expect(enmascararCelular('987654321')).toBe('9*****321');
    expect(enmascararCelular('12')).toBe('***');
  });

  it('correo: las 2 primeras letras y el dominio', () => {
    expect(enmascararCorreo('juan.perez@correo.pe')).toBe('ju***@correo.pe');
    expect(enmascararCorreo('a@correo.pe')).toBe('a***@correo.pe');
    expect(enmascararCorreo('sin-arroba')).toBe('***');
    expect(enmascararCorreo('@correo.pe')).toBe('***');
  });

  it('según el canal', () => {
    expect(enmascararDestino('SMS', '987654321')).toBe('9*****321');
    expect(enmascararDestino('CORREO', 'juan@correo.pe')).toBe('ju***@correo.pe');
  });
});
