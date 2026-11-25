import { fireEvent, render, screen } from '@testing-library/react';
import { CampoFormulario } from './CampoFormulario';

describe('CampoFormulario', () => {
  it('un campo de clave empieza oculto y el ojo la muestra y la vuelve a ocultar (011)', () => {
    render(<CampoFormulario etiqueta="Clave" type="password" defaultValue="Secreta2026a" />);

    const campo = screen.getByLabelText('Clave');
    expect(campo).toHaveAttribute('type', 'password');

    const mostrar = screen.getByRole('button', { name: 'Mostrar clave' });
    expect(mostrar).toHaveAttribute('aria-pressed', 'false');
    expect(mostrar).toHaveAttribute('type', 'button');

    fireEvent.click(mostrar);
    expect(campo).toHaveAttribute('type', 'text');
    const ocultar = screen.getByRole('button', { name: 'Ocultar clave' });
    expect(ocultar).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(ocultar);
    expect(campo).toHaveAttribute('type', 'password');
  });

  it('el nombre del botón sigue la etiqueta del campo', () => {
    render(<CampoFormulario etiqueta="Nueva clave temporal" type="password" />);

    expect(
      screen.getByRole('button', { name: 'Mostrar nueva clave temporal' }),
    ).toBeInTheDocument();
  });

  it('el ojo no envía el formulario', () => {
    const alEnviar = jest.fn((evento: { preventDefault: () => void }) => {
      evento.preventDefault();
    });
    render(
      <form onSubmit={alEnviar}>
        <CampoFormulario etiqueta="Clave" type="password" />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar clave' }));
    expect(alEnviar).not.toHaveBeenCalled();
  });

  it('un campo que no es de clave no tiene ojo', () => {
    render(<CampoFormulario etiqueta="Correo" type="email" />);

    expect(screen.getByLabelText('Correo')).toHaveAttribute('type', 'email');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // 013 (US5): las clases de CoreUI por dentro, con los mismos id, textos y atributos aria.
  it('usa form-label, form-control y form-text', () => {
    render(
      <CampoFormulario etiqueta="Correo" type="email" ayuda="El correo de la Municipalidad." />,
    );

    const campo = screen.getByLabelText('Correo');
    expect(campo).toHaveClass('form-control');
    expect(screen.getByText('Correo', { selector: 'label' })).toHaveClass('form-label');
    expect(screen.getByText('El correo de la Municipalidad.')).toHaveClass('form-text');
    expect(campo).toHaveAccessibleDescription('El correo de la Municipalidad.');
    expect(campo).not.toHaveClass('is-invalid');
    expect(campo).not.toHaveAttribute('aria-invalid');
  });

  it('con error: is-invalid en el control e invalid-feedback en el mensaje, con aria como hoy', () => {
    render(
      <CampoFormulario
        etiqueta="Correo"
        type="email"
        ayuda="El correo de la Municipalidad."
        error="Escribe un correo válido"
      />,
    );

    const campo = screen.getByLabelText('Correo');
    const error = screen.getByText('Escribe un correo válido');

    expect(campo).toHaveClass('form-control', 'is-invalid');
    expect(error).toHaveClass('invalid-feedback');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription(
      'El correo de la Municipalidad. Escribe un correo válido',
    );
  });

  it('un campo de clave también tiene form-control y su error', () => {
    render(<CampoFormulario etiqueta="Clave" type="password" error="Falta la clave" />);

    expect(screen.getByLabelText('Clave')).toHaveClass('form-control', 'is-invalid');
    expect(screen.getByText('Falta la clave')).toHaveClass('invalid-feedback');
  });
});
