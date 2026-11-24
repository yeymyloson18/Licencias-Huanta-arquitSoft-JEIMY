import { render, screen, within } from '@testing-library/react';
import type { EventoAuditoriaSeguridad } from '../servicios/clienteApi';
import { TablaEventos } from './TablaEventos';

// Datos FICTICIOS con la forma del contrato (EventoAuditoriaSeguridad de la 010).
const base = {
  id: '1',
  ocurridoEn: '2026-11-24T15:00:00Z',
  accion: 'CODIGO_ENVIADO',
  textoAccion: 'Código enviado',
  actor: null,
  afectado: { id: '00000000-0000-4000-8000-0000000000bb', nombre: 'Beto Caja' },
  objeto: null,
  resultado: 'EXITO',
  codigoEnviado: {
    proposito: 'INGRESO_PERSONAL',
    canal: 'BUZON',
    destino: '9*****321',
    entrega: 'ENTREGADO',
    desenlace: 'INGRESO_CORRECTO',
  },
} as EventoAuditoriaSeguridad;

describe('Tabla de eventos: códigos enviados (010)', () => {
  it('muestra el medio, el destino enmascarado y el desenlace, sin el código', () => {
    render(<TablaEventos eventos={[base]} etiqueta="Eventos" />);

    const fila = within(screen.getAllByRole('row')[1] as HTMLElement);
    expect(
      fila.getByText(/por buzón de pruebas a 9\*\*\*\*\*321 · terminó en ingreso correcto/),
    ).toBeInTheDocument();
    expect(fila.getByText('Sin sesión')).toBeInTheDocument();
    expect(fila.getByText('Beto Caja')).toBeInTheDocument();
  });

  it('la identidad del administrado aparece en texto y sin desenlace', () => {
    render(
      <TablaEventos
        eventos={[
          {
            ...base,
            id: '2',
            afectado: null,
            objeto: 'IDENTIDAD_ADMINISTRADO',
            resultado: 'RECHAZADO',
            codigoEnviado: {
              proposito: 'IDENTIDAD_ADMINISTRADO',
              canal: 'SIMULADO',
              destino: '9*****001',
              entrega: 'FALLIDO',
              desenlace: null,
            },
          },
          {
            ...base,
            id: '3',
            accion: 'CODIGO_LIMITE_ALCANZADO',
            textoAccion: 'Límite de códigos alcanzado',
            resultado: 'RECHAZADO',
            codigoEnviado: null,
          },
        ]}
        etiqueta="Eventos"
      />,
    );

    const filas = screen.getAllByRole('row');
    expect(
      within(filas[1] as HTMLElement).getByText('Identidad del administrado'),
    ).toBeInTheDocument();
    expect(
      within(filas[1] as HTMLElement).getByText('(por simulado a 9*****001)'),
    ).toBeInTheDocument();
    expect(
      within(filas[2] as HTMLElement).getByText('Límite de códigos alcanzado'),
    ).toBeInTheDocument();
  });
});
