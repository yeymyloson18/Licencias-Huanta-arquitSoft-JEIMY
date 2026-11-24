import {
  aCsvAuditoria,
  celdaCsv,
  COLUMNAS_CSV_AUDITORIA,
  fechaHoraLima,
} from '../../../../../src/modulos/seguridad/dominio/csv-auditoria';
import {
  ErrorFiltroAuditoria,
  resolverFiltroAuditoria,
} from '../../../../../src/modulos/seguridad/dominio/filtro-auditoria';
import type { FilaAuditoria } from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-auditoria';

const HOY = '2026-11-23';

describe('resolverFiltroAuditoria (research §R-08 de la 009)', () => {
  it('sin fechas: los últimos 30 días hasta el final de hoy, en hora de Lima', () => {
    expect(resolverFiltroAuditoria({}, HOY)).toEqual({
      desde: new Date('2026-10-25T05:00:00Z'),
      hasta: new Date('2026-11-24T05:00:00Z'),
    });
  });

  it('con fechas: desde las 00:00 de "desde" hasta el día siguiente a "hasta", con los demás filtros', () => {
    expect(
      resolverFiltroAuditoria(
        {
          desde: '2026-11-01',
          hasta: '2026-11-01',
          accion: 'ROL_ASIGNADO',
          actorId: 'a',
          afectadoId: 'b',
        },
        HOY,
      ),
    ).toEqual({
      desde: new Date('2026-11-01T05:00:00Z'),
      hasta: new Date('2026-11-02T05:00:00Z'),
      accion: 'ROL_ASIGNADO',
      actorId: 'a',
      afectadoId: 'b',
    });
  });

  it('solo "hasta": 30 días hacia atrás desde esa fecha', () => {
    expect(resolverFiltroAuditoria({ hasta: '2026-06-30' }, HOY).desde).toEqual(
      new Date('2026-06-01T05:00:00Z'),
    );
  });

  const error = (accion: () => unknown): ErrorFiltroAuditoria => {
    try {
      accion();
    } catch (e) {
      return e as ErrorFiltroAuditoria;
    }
    throw new Error('no lanzó');
  };

  it('rechaza fechas inválidas nombrando los campos', () => {
    expect(
      error(() => resolverFiltroAuditoria({ desde: '2026-02-30', hasta: 'ayer' }, HOY)).campos,
    ).toEqual(['desde', 'hasta']);
  });

  it('rechaza "desde" posterior a "hasta"', () => {
    const e = error(() =>
      resolverFiltroAuditoria({ desde: '2026-11-10', hasta: '2026-11-09' }, HOY),
    );
    expect(e).toBeInstanceOf(ErrorFiltroAuditoria);
    expect(e.campos).toEqual(['desde']);
  });

  it('acepta 366 días y rechaza 367', () => {
    expect(() =>
      resolverFiltroAuditoria({ desde: '2025-11-23', hasta: '2026-11-23' }, HOY),
    ).not.toThrow();
    expect(
      error(() => resolverFiltroAuditoria({ desde: '2025-11-22', hasta: '2026-11-23' }, HOY))
        .campos,
    ).toEqual(['desde', 'hasta']);
  });
});

const fila = (extra: Partial<FilaAuditoria> = {}): FilaAuditoria =>
  ({
    id: '1',
    ocurridoEn: new Date('2026-11-23T20:05:09Z'),
    accion: 'ROL_ASIGNADO',
    actor: { id: 'a', nombre: 'Ana Admin' },
    afectado: { id: 'b', nombre: 'Beto; "Caja"' },
    objeto: null,
    resultado: 'EXITO',
    codigoEnviado: null,
    ...extra,
  }) as FilaAuditoria;

describe('CSV de la auditoría (formato de la 007)', () => {
  it('fecha y hora en Lima', () => {
    expect(fechaHoraLima(new Date('2026-11-24T04:30:00Z'))).toBe('2026-11-23 23:30:00');
  });

  it('BOM, cabecera, punto y coma, CRLF y comillas cuando hace falta', () => {
    const csv = aCsvAuditoria([fila()]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const [cabecera, linea] = csv.slice(1).split('\r\n');
    expect(cabecera).toBe(COLUMNAS_CSV_AUDITORIA.join(';'));
    expect(linea).toBe('2026-11-23 15:05:09;Rol asignado;Ana Admin;"Beto; ""Caja""";;Éxito');
  });

  it('sin actor: "Sin sesión" en los ingresos y "Sistema" en el resto; con objeto y rechazo', () => {
    const csv = aCsvAuditoria([
      fila({ accion: 'CLAVE_INCORRECTA', actor: null, afectado: null, resultado: 'RECHAZADO' }),
      fila({ accion: 'RECETA_ACTUALIZADA', actor: null, afectado: null, objeto: 'LIC-01' }),
    ]);
    const lineas = csv.slice(1).split('\r\n');

    expect(lineas[1]).toBe('2026-11-23 15:05:09;Clave incorrecta;Sin sesión;;;Rechazado');
    expect(lineas[2]).toBe('2026-11-23 15:05:09;Receta actualizada;Sistema;;LIC-01;Éxito');
  });

  it('un nombre que empieza como fórmula lleva apóstrofo', () => {
    expect(celdaCsv('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(celdaCsv('@suma')).toBe("'@suma");
    expect(celdaCsv('normal')).toBe('normal');
  });

  it('sin filas: solo la cabecera', () => {
    expect(aCsvAuditoria([])).toBe(`﻿${COLUMNAS_CSV_AUDITORIA.join(';')}\r\n`);
  });
});
