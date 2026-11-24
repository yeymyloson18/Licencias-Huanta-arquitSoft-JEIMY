import {
  CalcularPlazos,
  ErrorFeriadoNoEncontrado,
  ErrorFeriadoRepetido,
  GestionarFeriados,
} from '../../../../../src/modulos/plazos/aplicacion/feriados';
import { ErrorDatoFeriado, type Feriado } from '../../../../../src/modulos/plazos/dominio/feriado';
import type { RepositorioFeriados } from '../../../../../src/modulos/plazos/dominio/puertos';

class FeriadosEnMemoria implements RepositorioFeriados {
  readonly feriados = new Map<string, Feriado>([
    [
      '2026-12-08',
      { fecha: '2026-12-08', descripcion: 'Inmaculada Concepción', alcance: 'NACIONAL' },
    ],
  ]);
  readonly rangos: string[] = [];
  listar(anio: number) {
    return Promise.resolve(
      [...this.feriados.values()].filter((f) => f.fecha.startsWith(String(anio))),
    );
  }
  fechasEntre(desde: string, hasta: string) {
    this.rangos.push(`${desde}..${hasta}`);
    return Promise.resolve(
      new Set([...this.feriados.keys()].filter((f) => f >= desde && f <= hasta)),
    );
  }
  registrar(feriado: Feriado) {
    if (this.feriados.has(feriado.fecha)) {
      return Promise.resolve('REPETIDO' as const);
    }
    this.feriados.set(feriado.fecha, feriado);
    return Promise.resolve('REGISTRADO' as const);
  }
  readonly eliminadoPor: string[] = [];
  eliminar(fecha: string, usuarioId: string) {
    const borrado = this.feriados.delete(fecha);
    if (borrado) {
      this.eliminadoPor.push(usuarioId);
    }
    return Promise.resolve(borrado);
  }
}

describe('GestionarFeriados (FR-023 de la 006)', () => {
  let repositorio: FeriadosEnMemoria;
  let gestionar: GestionarFeriados;

  beforeEach(() => {
    repositorio = new FeriadosEnMemoria();
    gestionar = new GestionarFeriados(repositorio);
  });

  it('registra, lista por año y elimina', async () => {
    await gestionar.registrar(
      { fecha: '2026-06-24', descripcion: 'Inti Raymi', alcance: 'REGIONAL' },
      'admin',
    );

    expect((await gestionar.listar(2026)).map((f) => f.fecha).sort()).toEqual([
      '2026-06-24',
      '2026-12-08',
    ]);
    await gestionar.eliminar('2026-06-24', 'admin-1');
    expect(repositorio.eliminadoPor).toEqual(['admin-1']);
    expect(await gestionar.listar(2026)).toHaveLength(1);
  });

  it('una fecha repetida es un conflicto; eliminar una que no hay, no encontrado', async () => {
    await expect(
      gestionar.registrar({ fecha: '2026-12-08', descripcion: 'Otro', alcance: 'LOCAL' }, 'admin'),
    ).rejects.toBeInstanceOf(ErrorFeriadoRepetido);
    await expect(gestionar.eliminar('2026-06-25', 'admin-1')).rejects.toBeInstanceOf(
      ErrorFeriadoNoEncontrado,
    );
    await expect(gestionar.eliminar('25-06-2026', 'admin-1')).rejects.toBeInstanceOf(
      ErrorDatoFeriado,
    );
  });
});

describe('CalcularPlazos (FR-025 de la 006)', () => {
  it('usa los feriados registrados del rango necesario', async () => {
    const repositorio = new FeriadosEnMemoria();
    const calcular = new CalcularPlazos(repositorio);

    expect(await calcular.sumarDiasHabiles('2026-12-04', 2)).toBe('2026-12-09');
    expect(await calcular.diasHabilesRestantes('2026-12-07', '2026-12-10')).toBe(2);
    expect(await calcular.diasHabilesRestantes('2026-12-10', '2026-12-07')).toBe(-2);
    expect(repositorio.rangos[1]).toBe('2026-12-07..2026-12-10');
  });

  it('un feriado nuevo cuenta desde el siguiente cálculo', async () => {
    const repositorio = new FeriadosEnMemoria();
    const calcular = new CalcularPlazos(repositorio);
    expect(await calcular.sumarDiasHabiles('2026-11-16', 2)).toBe('2026-11-18');

    await repositorio.registrar({ fecha: '2026-11-17', descripcion: 'Local', alcance: 'LOCAL' });

    expect(await calcular.sumarDiasHabiles('2026-11-16', 2)).toBe('2026-11-19');
  });
});
