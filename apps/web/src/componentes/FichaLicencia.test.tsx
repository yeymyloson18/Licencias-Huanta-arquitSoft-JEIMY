import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import type { Receta } from '../servicios/clienteApi';
import { FichaLicencia } from './FichaLicencia';

// Datos de ejemplo con la forma del contrato (los valores reales vienen siempre de la API).
const riesgoAlto: Receta = {
  codigo: 'LIC-03',
  nombre: 'Licencia de funcionamiento – riesgo alto',
  tipo: 'LICENCIA',
  ruta: 'B',
  tasa: '305.90',
  plazoDias: 8,
  codigoTupa: 'PE102735B77',
  paginaTupa: 372,
  nivelRiesgo: 'ALTO',
  tipoPlazo: 'HABILES',
  calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
  ordenItse: 'PREVIA',
  plazoItseDias: 7,
  vigenciaMeses: null,
  requisitos: [
    {
      id: 1,
      orden: 1,
      descripcion: 'Solicitud con declaración jurada',
      obligatorio: true,
      condicion: 'SIEMPRE',
    },
    {
      id: 2,
      orden: 2,
      descripcion: 'Carta poder',
      obligatorio: true,
      condicion: 'CON_REPRESENTANTE',
    },
    {
      id: 3,
      orden: 3,
      descripcion: 'Croquis de ubicación',
      obligatorio: true,
      condicion: 'SIN_PLANOS_VIGENTES',
    },
    {
      id: 4,
      orden: 4,
      descripcion: 'Requisitos especiales',
      obligatorio: true,
      condicion: 'GIRO_ESPECIAL',
    },
  ],
};

const bodega: Receta = {
  ...riesgoAlto,
  codigo: 'LIC-09',
  nombre: 'Licencia provisional para bodegas',
  ruta: 'C',
  tasa: '0.00',
  plazoDias: 5,
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'DENTRO_6_MESES',
  plazoItseDias: null,
  vigenciaMeses: 12,
};

const cambioDeGiro: Receta = {
  ...riesgoAlto,
  codigo: 'CGI-01',
  nombre: 'Cambio de giro',
  tipo: 'TRAMITE_CONECTADO',
  ruta: null,
  tasa: '46.20',
  plazoDias: null,
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: null,
  plazoItseDias: null,
  vigenciaMeses: null,
  requisitos: [],
};

const dato = (etiqueta: string) => {
  const termino = screen.queryByText(etiqueta, { selector: 'dt' });
  return termino?.nextElementSibling?.textContent.replace(/\s/g, ' ') ?? null;
};

// La ficha tiene un enlace del portal ("Presentar solicitud"): necesita el enrutador.
const montar = (elemento: ReactElement) => render(<MemoryRouter>{elemento}</MemoryRouter>);

describe('FichaLicencia', () => {
  it('muestra el nombre como título y los datos de una licencia de evaluación previa', () => {
    montar(<FichaLicencia receta={riesgoAlto} />);

    expect(
      screen.getByRole('article', { name: 'Licencia de funcionamiento – riesgo alto' }),
    ).toBeInTheDocument();
    expect(dato('Tasa')).toBe('S/ 305.90');
    expect(dato('Plazo')).toBe('8 días hábiles');
    expect(dato('Aprobación')).toBe('Evaluación previa con silencio positivo');
    expect(dato('Inspección ITSE')).toBe('Previa, hasta 7 días hábiles');
    expect(dato('Vigencia')).toBe('Indeterminada');
  });

  it('lista los requisitos en orden y etiqueta los condicionales', () => {
    montar(<FichaLicencia receta={riesgoAlto} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent(/^Solicitud con declaración jurada$/);
    expect(items[1]).toHaveTextContent('Solo si actúa un representante');
    expect(items[2]).toHaveTextContent(
      'No se pide si presentaste planos en los últimos 5 años y la edificación no cambió',
    );
    expect(items[3]).toHaveTextContent('Solo si tu giro lo exige');
  });

  it('muestra la bodega como gratuita, con ITSE dentro de 6 meses y provisional de 12 meses', () => {
    montar(<FichaLicencia receta={bodega} />);

    expect(dato('Tasa')).toBe('Gratuito');
    expect(dato('Aprobación')).toBe('Aprobación automática');
    expect(dato('Inspección ITSE')).toBe('Se notifica dentro de 6 meses');
    expect(dato('Vigencia')).toBe('Provisional de 12 meses');
  });

  it('en un trámite conectado omite lo que no aplica (plazo, ITSE y vigencia), sin mostrar vacíos', () => {
    montar(<FichaLicencia receta={cambioDeGiro} />);

    expect(dato('Tasa')).toBe('S/ 46.20');
    expect(dato('Plazo')).toBeNull();
    expect(dato('Inspección ITSE')).toBeNull();
    expect(dato('Vigencia')).toBeNull();
    expect(screen.getByText('Consulta los requisitos en la municipalidad.')).toBeInTheDocument();
  });

  it('indica el tipo de días cuando el plazo es en días calendario', () => {
    montar(<FichaLicencia receta={{ ...riesgoAlto, tipoPlazo: 'CALENDARIO', plazoDias: 10 }} />);

    expect(dato('Plazo')).toBe('10 días calendario');
  });

  it('en una licencia ofrece "Presentar solicitud" hacia la identidad con el código', () => {
    montar(<FichaLicencia receta={riesgoAlto} />);

    expect(screen.getByRole('link', { name: 'Presentar solicitud' })).toHaveAttribute(
      'href',
      '/tramite/identidad?licencia=LIC-03',
    );
  });

  it('en un trámite conectado no ofrece presentar en línea', () => {
    montar(<FichaLicencia receta={cambioDeGiro} />);

    expect(screen.queryByRole('link', { name: 'Presentar solicitud' })).not.toBeInTheDocument();
  });
});
