import { render, screen } from '@testing-library/react';
import { ESTADOS } from './estados';
import { InsigniaEstado } from './InsigniaEstado';

// Insignia del estado de un expediente (013, US4): el nombre de ESTADOS con el color de su grupo.

const GRUPOS: readonly [string, readonly string[]][] = [
  ['text-bg-info', ['REGISTRADO', 'EN_EVALUACION', 'EN_INSPECCION', 'ITSE_POSTERIOR_PENDIENTE']],
  ['text-bg-warning', ['OBSERVADO', 'PENDIENTE_PAGO']],
  [
    'text-bg-success',
    ['PAGADO', 'APROBADO', 'LICENCIA_PROVISIONAL', 'LICENCIA_EMITIDA', 'FINALIZADO'],
  ],
  ['text-bg-danger', ['DENEGADO', 'DERIVADO_A_FISCALIZACION']],
];

const CASOS = GRUPOS.flatMap(([clase, estados]) =>
  estados.map((estado) => [estado, clase] as const),
);

describe('InsigniaEstado', () => {
  it('cubre los 13 estados de ESTADOS', () => {
    expect(CASOS.map(([estado]) => estado).sort()).toEqual(Object.keys(ESTADOS).sort());
  });

  it.each(CASOS)('%s muestra su nombre con la clase %s', (estado, clase) => {
    render(<InsigniaEstado estado={estado} />);

    const insignia = screen.getByText(ESTADOS[estado as keyof typeof ESTADOS]);
    expect(insignia).toHaveClass('badge', clase);
  });

  it('un estado sin grupo muestra su código con text-bg-secondary', () => {
    render(<InsigniaEstado estado="OTRO_ESTADO" />);

    expect(screen.getByText('OTRO_ESTADO')).toHaveClass('badge', 'text-bg-secondary');
  });
});
