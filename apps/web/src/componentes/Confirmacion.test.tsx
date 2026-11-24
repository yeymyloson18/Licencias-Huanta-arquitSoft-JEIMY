import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Confirmacion } from './Confirmacion';

describe('Confirmación (009)', () => {
  it('es un diálogo con título y mensaje, empieza en "Cancelar" y confirma con el botón', async () => {
    const confirmar = jest.fn();
    const cancelar = jest.fn();
    render(
      <Confirmacion
        titulo="Desbloquear cuenta"
        mensaje="Podrá volver a intentar."
        textoConfirmar="Desbloquear"
        onConfirmar={confirmar}
        onCancelar={cancelar}
      />,
    );

    const dialogo = screen.getByRole('alertdialog', { name: 'Desbloquear cuenta' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveAccessibleDescription('Podrá volver a intentar.');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('"Cancelar" y Escape cancelan; mientras envía, "Confirmar" queda deshabilitado', async () => {
    const cancelar = jest.fn();
    const usuario = userEvent.setup();
    render(
      <Confirmacion
        titulo="Cerrar sesiones"
        mensaje="m"
        textoConfirmar="Cerrar"
        enviando
        onConfirmar={jest.fn()}
        onCancelar={cancelar}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    await usuario.keyboard('{Escape}');
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancelar).toHaveBeenCalledTimes(2);
  });
});
