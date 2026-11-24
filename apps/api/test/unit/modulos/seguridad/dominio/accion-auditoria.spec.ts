import {
  ACCIONES_AUDITORIA,
  ACCIONES_INGRESO_FALLIDO,
  esAccionAuditoria,
  grupoAccion,
  textoAccion,
  textoSinActor,
} from '../../../../../src/modulos/seguridad/dominio/accion-auditoria';

describe('Acciones de la auditoría de seguridad', () => {
  it('son las 21 de la 009 más las 2 de la 010, sin repetir', () => {
    expect(ACCIONES_AUDITORIA).toHaveLength(23);
    expect(new Set(ACCIONES_AUDITORIA).size).toBe(23);
    expect(ACCIONES_AUDITORIA).toContain('CODIGO_ENVIADO');
    expect(ACCIONES_AUDITORIA).toContain('CODIGO_LIMITE_ALCANZADO');
  });

  it('cada acción tiene un texto en español y uno de los 3 grupos', () => {
    const grupos = new Map<string, number>();
    for (const accion of ACCIONES_AUDITORIA) {
      expect(textoAccion(accion).length).toBeGreaterThan(3);
      const grupo = grupoAccion(accion);
      grupos.set(grupo, (grupos.get(grupo) ?? 0) + 1);
    }
    expect(Object.fromEntries(grupos)).toEqual({
      INGRESOS: 9,
      GESTION_USUARIOS: 9,
      CONFIGURACION: 5,
    });
  });

  it('reconoce solo las acciones de la lista', () => {
    expect(esAccionAuditoria('CUENTA_DESBLOQUEADA')).toBe(true);
    expect(esAccionAuditoria('BORRAR_TODO')).toBe(false);
    expect(esAccionAuditoria(3)).toBe(false);
  });

  it('los ingresos fallidos son los 4 rechazos de ingreso', () => {
    expect(ACCIONES_INGRESO_FALLIDO).toEqual([
      'CLAVE_INCORRECTA',
      'CODIGO_INCORRECTO',
      'CUENTA_BLOQUEADA',
      'ORIGEN_BLOQUEADO',
    ]);
  });

  it('sin actor: "Sin sesión" en los ingresos y "Sistema" en el resto', () => {
    expect(textoSinActor('CLAVE_INCORRECTA')).toBe('Sin sesión');
    expect(textoSinActor('RECETA_ACTUALIZADA')).toBe('Sistema');
    expect(textoAccion('SESIONES_CERRADAS')).toBe('Sesiones cerradas por el administrador');
    expect(textoAccion('CODIGO_ENVIADO')).toBe('Código enviado');
    expect(textoSinActor('CODIGO_LIMITE_ALCANZADO')).toBe('Sin sesión');
  });
});
