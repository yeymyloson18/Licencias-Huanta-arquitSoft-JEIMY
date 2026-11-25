import {
  MARCA_DATO_PERSONAL,
  quitarDatosPersonales,
} from '../../../../../src/modulos/orientacion/dominio/quitar-datos-personales';

// FR-014 de la 012 (research R-07, Ley N.° 29733): DNI, RUC, celular, CE y correo nunca salen hacia
// el proveedor. Datos FICTICIOS.

describe('quitarDatosPersonales', () => {
  it.each([
    ['un correo', 'escríbanme a ana.perez@correo.pe por favor'],
    ['un celular de 9 dígitos', 'mi cel es 987654321'],
    ['un celular con espacios', 'mi cel es 987 654 321'],
    ['un celular con guiones', 'mi cel es 987-654-321'],
    ['un celular con +51', 'mi cel es +51 987654321'],
    ['un celular con 51 pegado', 'mi cel es 51987654321'],
    ['un RUC 20', 'mi RUC es 20123456789'],
    ['un RUC 10', 'mi RUC es 10400000011'],
    ['un DNI', 'mi DNI es 40000001'],
    ['un carné de extranjería', 'mi CE es 001234567'],
  ])('reemplaza %s por la marca neutra', (_caso, texto) => {
    const resultado = quitarDatosPersonales(texto);

    expect(resultado.quitados).toBe(true);
    expect(resultado.texto).toContain(MARCA_DATO_PERSONAL);
    expect(resultado.texto).not.toMatch(/\d{8,}|@/);
  });

  it('quita varios datos de la misma pregunta', () => {
    const resultado = quitarDatosPersonales(
      'DNI 40000001, RUC 20123456789, cel 987 654 321, correo ana.perez@correo.pe, ¿cómo va?',
    );

    expect(resultado).toEqual({
      texto:
        `DNI ${MARCA_DATO_PERSONAL}, RUC ${MARCA_DATO_PERSONAL}, cel ${MARCA_DATO_PERSONAL}, ` +
        `correo ${MARCA_DATO_PERSONAL}, ¿cómo va?`,
      quitados: true,
    });
  });

  it('un RUC se reemplaza entero, no como un DNI más un resto', () => {
    expect(quitarDatosPersonales('RUC 20123456789').texto).toBe(`RUC ${MARCA_DATO_PERSONAL}`);
  });

  it.each([
    ['un número de expediente', '¿cómo va el EXP-2026-000123?'],
    ['un área', 'mi local tiene 120 m²'],
    ['un año', 'según el TUPA 2024'],
    ['un monto', 'la tasa es S/ 177.10'],
    ['un plazo', 'demora 15 días hábiles'],
    ['un código de receta', 'la LIC-02'],
    ['un número de 7 dígitos', 'código 1234567'],
  ])('conserva %s', (_caso, texto) => {
    expect(quitarDatosPersonales(texto)).toEqual({ texto, quitados: false });
  });

  it('un texto sin datos queda igual', () => {
    expect(quitarDatosPersonales('¿Cuánto cuesta una bodega?')).toEqual({
      texto: '¿Cuánto cuesta una bodega?',
      quitados: false,
    });
  });
});
