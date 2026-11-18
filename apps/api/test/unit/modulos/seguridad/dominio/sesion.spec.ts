import { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';

const T0 = new Date('2026-11-17T08:00:00.000Z');
const despues = (minutos: number, segundos = 0) =>
  new Date(T0.getTime() + minutos * 60_000 + segundos * 1000);
const iguales = (a: string, b: string) => a === b;

const nueva = () =>
  Sesion.crear({ id: 'sesion-1', usuarioId: 'usuario-1', refreshHash: 'h0', creadaEn: T0 });

describe('Sesion', () => {
  it('dura como máximo 8 horas (venceMaximoEn = creadaEn + 8 h)', () => {
    const sesion = nueva();

    expect(sesion.venceMaximoEn).toEqual(despues(8 * 60));
    expect(sesion.ultimaActividadEn).toEqual(T0);
    expect(sesion.revocada).toBe(false);
  });

  it('con el refresh vigente rota: el vigente pasa a anterior y se guarda el nuevo', () => {
    const sesion = nueva();

    expect(sesion.renovar('h0', 'h1', despues(13), iguales)).toBe('ROTADA');
    expect(sesion.refreshHash).toBe('h1');
    expect(sesion.refreshAnteriorHash).toBe('h0');
    expect(sesion.rotadaEn).toEqual(despues(13));
    expect(sesion.ultimaActividadEn).toEqual(despues(13));
  });

  it('el refresh anterior pasados más de 10 s es REUTILIZADA', () => {
    const sesion = nueva();
    sesion.renovar('h0', 'h1', despues(13), iguales);

    expect(sesion.renovar('h0', 'h2', despues(13, 11), iguales)).toBe('REUTILIZADA');
    expect(sesion.refreshHash).toBe('h1');
  });

  it('el refresh anterior dentro de 10 s es CARRERA (dos pestañas)', () => {
    const sesion = nueva();
    sesion.renovar('h0', 'h1', despues(13), iguales);

    expect(sesion.renovar('h0', 'h2', despues(13, 10), iguales)).toBe('CARRERA');
    expect(sesion.refreshHash).toBe('h1');
  });

  it('a las 8 horas está VENCIDA', () => {
    expect(nueva().renovar('h0', 'h1', despues(8 * 60), iguales)).toBe('VENCIDA');
  });

  it('con más de 30 minutos desde la última renovación está INACTIVA (FR-003a)', () => {
    const sesion = nueva();

    expect(sesion.renovar('h0', 'h1', despues(30), iguales)).toBe('ROTADA');
    expect(sesion.renovar('h1', 'h2', despues(60, 1), iguales)).toBe('INACTIVA');
  });

  it('un refresh que no corresponde a la sesión es DESCONOCIDA', () => {
    expect(nueva().renovar('otro', 'h1', despues(1), iguales)).toBe('DESCONOCIDA');
  });

  it('una sesión revocada nunca renueva', () => {
    const sesion = nueva();
    sesion.revocar(despues(5));

    expect(sesion.revocada).toBe(true);
    expect(sesion.revocadaEn).toEqual(despues(5));
    expect(sesion.renovar('h0', 'h1', despues(6), iguales)).toBe('REVOCADA');
  });

  it('revocar dos veces conserva la primera fecha', () => {
    const sesion = nueva();
    sesion.revocar(despues(5));
    sesion.revocar(despues(9));

    expect(sesion.revocadaEn).toEqual(despues(5));
  });

  it('reconoce su refresh vigente o el anterior', () => {
    const sesion = nueva();
    sesion.renovar('h0', 'h1', despues(1), iguales);

    expect(sesion.reconoce('h1', iguales)).toBe(true);
    expect(sesion.reconoce('h0', iguales)).toBe(true);
    expect(sesion.reconoce('otro', iguales)).toBe(false);
  });

  it('rotar a la fuerza (al cambiar la clave) actualiza los hashes', () => {
    const sesion = nueva();

    sesion.rotar('h9', despues(2));

    expect(sesion.refreshHash).toBe('h9');
    expect(sesion.refreshAnteriorHash).toBe('h0');
  });

  it('se reconstruye con su estado', () => {
    const sesion = Sesion.reconstruir({
      id: 's',
      usuarioId: 'u',
      refreshHash: 'h1',
      refreshAnteriorHash: 'h0',
      rotadaEn: despues(1),
      creadaEn: T0,
      venceMaximoEn: despues(480),
      ultimaActividadEn: despues(1),
      revocadaEn: undefined,
    });

    expect(sesion.renovar('h1', 'h2', despues(5), iguales)).toBe('ROTADA');
  });
});
