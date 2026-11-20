import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, problema, simularApi } from '../pruebas/api-simulada';
import type { Expediente } from '../servicios/clienteApi';
import { AccionesEvaluador } from './AccionesEvaluador';

// Datos FICTICIOS con la forma del contrato (Expediente de la 005).
const base = {
  numero: 'EXP-2026-000010',
  estado: 'EN_EVALUACION',
  ruta: 'A',
  codigoReceta: 'LIC-02',
  nombreTitular: 'Titular de Prueba',
  presentadoEn: '2026-11-20T15:00:00.000Z',
  version: 4,
  canal: 'EN_LINEA',
  documentos: [],
  historial: [],
  observaciones: [],
  licenciasDelGrupo: [
    { codigoReceta: 'LIC-01', nombre: 'Riesgo bajo', tasa: '159.50', ruta: 'A' },
    { codigoReceta: 'LIC-02', nombre: 'Riesgo medio', tasa: '177.10', ruta: 'A' },
    { codigoReceta: 'LIC-03', nombre: 'Riesgo alto', tasa: '305.90', ruta: 'B' },
  ],
} as unknown as Expediente;

const montar = (expediente: Expediente = base) => {
  const actualizar = jest.fn();
  const cambiar = jest.fn();
  render(
    <AccionesEvaluador expediente={expediente} alActualizar={actualizar} alCambiar={cambiar} />,
  );
  return { actualizar, cambiar, usuario: userEvent.setup() };
};

describe('AccionesEvaluador (005)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('REGISTRADO: solo "Empezar revisión", que envía la versión en If-Match', async () => {
    const cabeceras: (string | null)[] = [];
    simularApi({
      'POST /expedientes/EXP-2026-000010/evaluacion': (peticion) => {
        cabeceras.push(peticion.headers.get('If-Match'));
        return json({ ...base, estado: 'EN_EVALUACION', version: 5 });
      },
    });
    const { actualizar, usuario } = montar({ ...base, estado: 'REGISTRADO' });

    expect(screen.queryByRole('button', { name: 'Confirmar riesgo' })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Empezar revisión' }));

    expect(cabeceras).toEqual(['4']);
    expect(actualizar).toHaveBeenCalledWith(expect.objectContaining({ version: 5 }));
  });

  it('EN_EVALUACION: confirmar con la licencia presentada no envía código de receta', async () => {
    const llamadas = simularApi({
      'POST /expedientes/EXP-2026-000010/riesgo': () => json({ ...base, estado: 'PENDIENTE_PAGO' }),
    });
    const { actualizar, usuario } = montar();

    await usuario.click(screen.getByRole('button', { name: 'Confirmar riesgo' }));
    const lista = screen.getByLabelText('Licencia confirmada');
    expect(
      within(lista)
        .getAllByRole('option')
        // El formato de soles usa un espacio indivisible.
        .map((o) => o.textContent.replace(/\s/g, ' ')),
    ).toEqual([
      'Riesgo bajo — S/ 159.50',
      'Riesgo medio — S/ 177.10 (presentada)',
      'Riesgo alto — S/ 305.90',
    ]);
    await usuario.click(screen.getByRole('button', { name: 'Confirmar y generar esquela' }));

    expect(llamadas.find((l) => l.clave.endsWith('/riesgo'))?.cuerpo).toEqual({});
    expect(actualizar).toHaveBeenCalledWith(expect.objectContaining({ estado: 'PENDIENTE_PAGO' }));
  });

  it('corregir el riesgo envía la licencia elegida', async () => {
    const llamadas = simularApi({
      'POST /expedientes/EXP-2026-000010/riesgo': () => json({ ...base, codigoReceta: 'LIC-03' }),
    });
    const { usuario } = montar();

    await usuario.click(screen.getByRole('button', { name: 'Confirmar riesgo' }));
    await usuario.selectOptions(screen.getByLabelText('Licencia confirmada'), 'LIC-03');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar y generar esquela' }));

    expect(llamadas.find((l) => l.clave.endsWith('/riesgo'))?.cuerpo).toEqual({
      codigoReceta: 'LIC-03',
    });
  });

  it('observar exige al menos 10 caracteres y muestra el contador', async () => {
    const llamadas = simularApi({
      'POST /expedientes/EXP-2026-000010/observar': () => json({ ...base, estado: 'OBSERVADO' }),
    });
    const { actualizar, usuario } = montar();

    await usuario.click(screen.getByRole('button', { name: 'Observar' }));
    await usuario.type(screen.getByLabelText('Qué falta'), 'Falta');
    expect(screen.getByText('5 de 1000 caracteres (mínimo 10)')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Observar expediente' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe al menos 10 caracteres.');
    expect(llamadas).toHaveLength(0);

    await usuario.type(screen.getByLabelText('Qué falta'), ' el croquis');
    await usuario.click(screen.getByRole('button', { name: 'Observar expediente' }));

    expect(llamadas[0]?.cuerpo).toEqual({ descripcion: 'Falta el croquis' });
    expect(actualizar).toHaveBeenCalled();
  });

  it('un expediente ya observado no ofrece "Observar"', () => {
    montar({
      ...base,
      observaciones: [{ descripcion: 'Falta el croquis' }],
    });

    expect(screen.queryByRole('button', { name: 'Observar' })).not.toBeInTheDocument();
  });

  it('denegar envía el motivo', async () => {
    const llamadas = simularApi({
      'POST /expedientes/EXP-2026-000010/denegar': () => json({ ...base, estado: 'DENEGADO' }),
    });
    const { usuario } = montar();

    await usuario.click(screen.getByRole('button', { name: 'Denegar' }));
    await usuario.type(
      screen.getByLabelText('Motivo de la denegación'),
      'El giro no está permitido',
    );
    await usuario.click(screen.getByRole('button', { name: 'Denegar expediente' }));

    expect(llamadas[0]?.cuerpo).toEqual({ motivo: 'El giro no está permitido' });
  });

  it.each([
    [409, 'transicion-invalida', /ya no corresponde/],
    [412, 'version-cambiada', /cambió mientras lo revisabas/],
  ])('con %i avisa que el expediente cambió para recargarlo', async (estado, tipo, mensaje) => {
    simularApi({ 'POST /expedientes/EXP-2026-000010/denegar': () => problema(estado, tipo) });
    const { cambiar, usuario } = montar();

    await usuario.click(screen.getByRole('button', { name: 'Denegar' }));
    await usuario.type(
      screen.getByLabelText('Motivo de la denegación'),
      'El giro no está permitido',
    );
    await usuario.click(screen.getByRole('button', { name: 'Denegar expediente' }));

    expect(cambiar).toHaveBeenCalledWith(expect.stringMatching(mensaje));
  });

  it('un error de validación de la API se muestra', async () => {
    simularApi({
      'POST /expedientes/EXP-2026-000010/riesgo': () =>
        json(
          { status: 422, errores: [{ campo: 'codigoReceta', mensaje: 'Solo del mismo grupo' }] },
          422,
        ),
    });
    const { usuario } = montar();

    await usuario.click(screen.getByRole('button', { name: 'Confirmar riesgo' }));
    await usuario.click(screen.getByRole('button', { name: 'Confirmar y generar esquela' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Solo del mismo grupo');
  });

  it('en otros estados no muestra acciones', () => {
    const { container } = render(
      <AccionesEvaluador
        expediente={{ ...base, estado: 'PENDIENTE_PAGO' }}
        alActualizar={jest.fn()}
        alCambiar={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
