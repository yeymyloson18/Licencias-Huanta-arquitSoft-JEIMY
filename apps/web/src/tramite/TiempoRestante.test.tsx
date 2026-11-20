import { act, render, screen } from '@testing-library/react';
import { TiempoRestante } from './TiempoRestante';

describe('TiempoRestante (permiso de identidad de 30 minutos)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-19T15:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const enMinutos = (minutos: number) => new Date(Date.now() + minutos * 60_000);

  it('con 30 minutos lo informa sin alarmar', () => {
    render(<TiempoRestante venceEn={enMinutos(30)} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Te quedan 30 minutos para presentar la solicitud.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('se actualiza con el paso del tiempo y avisa al quedar 5 minutos', () => {
    render(<TiempoRestante venceEn={enMinutos(6)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Te quedan 6 minutos');

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Te quedan 5 minutos para presentar la solicitud\. Si se acaba el tiempo, tendrás que confirmar tu identidad de nuevo\./,
    );
  });

  it('usa el singular con 1 minuto', () => {
    render(<TiempoRestante venceEn={enMinutos(0.5)} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Te quedan 1 minuto');
  });

  it('cuando vence lo dice y que lo escrito se conserva', () => {
    render(<TiempoRestante venceEn={enMinutos(1)} />);

    act(() => {
      jest.advanceTimersByTime(75_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Tu confirmación de identidad venció\..*lo que escribiste se conserva/,
    );
  });

  it('deja de contar al desmontarse', () => {
    const { unmount } = render(<TiempoRestante venceEn={enMinutos(30)} />);

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
