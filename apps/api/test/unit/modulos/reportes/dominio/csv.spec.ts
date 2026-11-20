import {
  aCsv,
  celdaCsv,
  huellaCorta,
  normalizarTexto,
} from '../../../../../src/modulos/reportes/dominio/csv';

// Datos FICTICIOS.
const FILA = {
  numero: 'LF-2026-000001',
  codigoReceta: 'LIC-02',
  titular: 'Juana P. Q.',
  giro: 'Bodega y abarrotes',
  zona: 'Centro',
  estado: 'VIGENTE',
  fecha: '2026-11-20',
};

describe('CSV del reporte (FR-010 de la 007)', () => {
  it('BOM, cabecera, punto y coma y CRLF, con tildes intactas', () => {
    const csv = aCsv([FILA, { ...FILA, numero: 'LF-2026-000002', zona: 'Pampa Ñahuin' }]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'numero;codigoReceta;titular;giro;zona;estado;fecha',
      'LF-2026-000001;LIC-02;Juana P. Q.;Bodega y abarrotes;Centro;VIGENTE;2026-11-20',
      'LF-2026-000002;LIC-02;Juana P. Q.;Bodega y abarrotes;Pampa Ñahuin;VIGENTE;2026-11-20',
      '',
    ]);
    expect(aCsv([])).toBe('﻿numero;codigoReceta;titular;giro;zona;estado;fecha\r\n');
  });

  it('escapa separadores, comillas y saltos de línea', () => {
    expect(celdaCsv('Venta; al por mayor')).toBe('"Venta; al por mayor"');
    expect(celdaCsv('Bodega "La Esquina"')).toBe('"Bodega ""La Esquina"""');
    expect(celdaCsv('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"');
    expect(celdaCsv('sin cambios')).toBe('sin cambios');
  });

  it.each(['=SUMA(A1)', '+51 999', '-1', '@cmd', '\tx'])(
    'un valor que empieza como fórmula (%j) lleva un apóstrofo',
    (valor) => {
      expect(celdaCsv(valor).replace(/^"/, '')).toMatch(/^'/);
    },
  );

  it('normaliza giro y zona sin mayúsculas, tildes ni espacios repetidos', () => {
    expect(normalizarTexto('  Pampa   ÑAHUÍN ')).toBe('pampa nahuin');
    expect(normalizarTexto('Bodega')).toBe(normalizarTexto('bódega'));
  });

  it('huella corta estable de 16 caracteres hexadecimales', () => {
    expect(huellaCorta('bodega|centro')).toMatch(/^[0-9a-f]{16}$/);
    expect(huellaCorta('bodega|centro')).toBe(huellaCorta('bodega|centro'));
    expect(huellaCorta('')).not.toBe(huellaCorta('|'));
  });
});
