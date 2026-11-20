import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { RutasAplicacion } from '../../Aplicacion';
import { problema, simularApi } from '../../pruebas/api-simulada';
import { ProveedorSesion } from '../../sesion/ProveedorSesion';
import { reiniciarSesion } from '../../sesion/almacen-sesion';

const EXPEDIENTE = {
  numero: 'EXP-2026-000123',
  estado: 'REGISTRADO',
  ruta: 'A',
  codigoReceta: 'LIC-02',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  canal: 'EN_LINEA',
  presentadoEn: '2026-11-19T15:00:00.000Z',
  vencePlazoEn: null,
  siguientePaso: 'La municipalidad revisará tus documentos y confirmará el nivel de riesgo',
};

const montar = (estado: unknown) =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/tramite/comprobante/EXP-2026-000123', state: estado }]}
    >
      <ProveedorSesion>
        <RutasAplicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  );

const dato = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Página Comprobante del trámite', () => {
  beforeEach(() => {
    simularApi({ 'POST /auth/renovar': () => problema(401, 'no-autenticado') });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    reiniciarSesion();
  });

  it('muestra número, licencia, ruta, estado, fecha y qué sigue', async () => {
    montar({ expediente: EXPEDIENTE });

    expect(await screen.findByText('EXP-2026-000123')).toHaveClass('comprobante__numero');
    expect(dato('Licencia')).toBe('Licencia de funcionamiento – riesgo medio');
    expect(dato('Ruta')).toBe('A');
    expect(dato('Estado')).toBe('Registrado');
    expect(dato('Presentada el')).toMatch(/19 de noviembre de 2026/);
    expect(screen.getByRole('heading', { name: 'Qué sigue' })).toBeInTheDocument();
    expect(
      screen.getByText('La municipalidad revisará tus documentos y confirmará el nivel de riesgo.'),
    ).toBeInTheDocument();
  });

  it('"Imprimir" abre la impresión del navegador', async () => {
    const imprimir = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    montar({ expediente: EXPEDIENTE });

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Imprimir' }));

    expect(imprimir).toHaveBeenCalledTimes(1);
  });

  it('al recargar (sin datos en memoria) conserva el número y un texto general', async () => {
    montar(null);

    expect(await screen.findByText('EXP-2026-000123')).toBeInTheDocument();
    expect(screen.getByText('Tu solicitud quedó registrada con este número.')).toBeInTheDocument();
    expect(screen.queryByText('Licencia', { selector: 'dt' })).not.toBeInTheDocument();
  });

  it('no usa estilos en línea', async () => {
    const { container } = montar({ expediente: EXPEDIENTE });
    await screen.findByText('EXP-2026-000123');

    expect(container.querySelector('[style]')).toBeNull();
  });
});
