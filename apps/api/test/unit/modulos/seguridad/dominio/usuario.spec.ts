import { Celular } from '../../../../../src/modulos/seguridad/dominio/celular';
import { Correo } from '../../../../../src/modulos/seguridad/dominio/correo';
import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';
import { NombreCompleto } from '../../../../../src/modulos/seguridad/dominio/nombre-completo';
import { Usuario } from '../../../../../src/modulos/seguridad/dominio/usuario';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-11-17T10:00:00Z');
const T1 = new Date('2026-11-17T11:00:00Z');

const crear = (roles: Parameters<typeof Usuario.crear>[0]['roles'] = ['CAJA']) =>
  Usuario.crear({
    id: '00000000-0000-4000-8000-0000000000aa',
    correo: Correo.crear('caja@ejemplo.pe'),
    nombreCompleto: NombreCompleto.crear('Persona de Caja'),
    celular: Celular.crear('987654321'),
    claveHash: '$argon2id$huella-temporal',
    roles,
    asignadoPor: ADMIN,
    en: T0,
  });

describe('Usuario', () => {
  describe('crear', () => {
    it('queda activo, con clave temporal y versión 1', () => {
      const usuario = crear();

      expect(usuario.activo).toBe(true);
      expect(usuario.debeCambiarClave).toBe(true);
      expect(usuario.versionSeguridad).toBe(1);
      expect(usuario.rolesVigentes).toEqual(['CAJA']);
    });

    it('registra quién asignó cada rol y cuándo (FR-019)', () => {
      const [asignacion] = crear(['CAJA', 'JEFATURA']).asignaciones;

      expect(asignacion?.asignadoPor).toBe(ADMIN);
      expect(asignacion?.asignadoEn).toEqual(T0);
      expect(asignacion?.esVigente).toBe(true);
    });

    it('exige al menos un rol y no admite roles repetidos', () => {
      expect(() => crear([])).toThrow(ErrorDominio);
      expect(crear(['CAJA', 'CAJA']).rolesVigentes).toEqual(['CAJA']);
    });
  });

  describe('desactivar y reactivar', () => {
    it('desactivar incrementa la versión de seguridad (FR-011)', () => {
      const usuario = crear();

      usuario.desactivar();

      expect(usuario.activo).toBe(false);
      expect(usuario.versionSeguridad).toBe(2);
    });

    it('desactivar a un usuario ya inactivo no cambia la versión', () => {
      const usuario = crear();
      usuario.desactivar();

      usuario.desactivar();

      expect(usuario.versionSeguridad).toBe(2);
    });

    it('reactivar conserva sus roles y su clave', () => {
      const usuario = crear(['CAJA', 'JEFATURA']);
      usuario.desactivar();

      usuario.reactivar();

      expect(usuario.activo).toBe(true);
      expect(usuario.rolesVigentes).toEqual(['CAJA', 'JEFATURA']);
      expect(usuario.claveHash).toBe('$argon2id$huella-temporal');
    });
  });

  describe('claves', () => {
    it('cambiarClave guarda la huella nueva, quita la marca temporal e incrementa la versión', () => {
      const usuario = crear();

      usuario.cambiarClave('$argon2id$definitiva');

      expect(usuario.claveHash).toBe('$argon2id$definitiva');
      expect(usuario.debeCambiarClave).toBe(false);
      expect(usuario.versionSeguridad).toBe(2);
    });

    it('asignarClaveTemporal marca que debe cambiarla e incrementa la versión (FR-022b)', () => {
      const usuario = crear();
      usuario.cambiarClave('$argon2id$definitiva');

      usuario.asignarClaveTemporal('$argon2id$otra-temporal');

      expect(usuario.debeCambiarClave).toBe(true);
      expect(usuario.claveHash).toBe('$argon2id$otra-temporal');
      expect(usuario.versionSeguridad).toBe(3);
    });
  });

  describe('reemplazarRoles', () => {
    it('retira los roles que ya no están y crea los nuevos, conservando el historial', () => {
      const usuario = crear(['CAJA', 'JEFATURA']);

      const cambios = usuario.reemplazarRoles(['JEFATURA', 'EVALUADOR'], ADMIN, T1);

      expect(cambios).toEqual({ retirados: ['CAJA'], creados: ['EVALUADOR'] });
      expect(usuario.rolesVigentes.sort()).toEqual(['EVALUADOR', 'JEFATURA']);
      const retirada = usuario.asignaciones.find((a) => a.rol === 'CAJA');
      expect(retirada?.esVigente).toBe(false);
      expect(retirada?.retiradoPor).toBe(ADMIN);
      expect(retirada?.retiradoEn).toEqual(T1);
      expect(usuario.versionSeguridad).toBe(2);
    });

    it('volver a dar un rol retirado crea una asignación nueva', () => {
      const usuario = crear(['CAJA', 'JEFATURA']);
      usuario.reemplazarRoles(['JEFATURA'], ADMIN, T1);

      usuario.reemplazarRoles(['JEFATURA', 'CAJA'], ADMIN, T1);

      expect(usuario.asignaciones.filter((a) => a.rol === 'CAJA')).toHaveLength(2);
      expect(usuario.rolesVigentes.sort()).toEqual(['CAJA', 'JEFATURA']);
    });

    it('sin cambios no incrementa la versión', () => {
      const usuario = crear(['CAJA']);

      expect(usuario.reemplazarRoles(['CAJA'], ADMIN, T1)).toEqual({ retirados: [], creados: [] });
      expect(usuario.versionSeguridad).toBe(1);
    });

    it('rechaza dejar al usuario sin roles', () => {
      expect(() => crear().reemplazarRoles([], ADMIN, T1)).toThrow(ErrorDominio);
    });
  });

  describe('datos personales', () => {
    it('cambia el nombre y el celular', () => {
      const usuario = crear();

      usuario.cambiarNombre(NombreCompleto.crear('Nuevo Nombre'));
      usuario.cambiarCelular(Celular.crear('912345678'));

      expect(usuario.nombreCompleto.valor).toBe('Nuevo Nombre');
      expect(usuario.celular.enmascarado()).toBe('9*****678');
    });
  });
});
