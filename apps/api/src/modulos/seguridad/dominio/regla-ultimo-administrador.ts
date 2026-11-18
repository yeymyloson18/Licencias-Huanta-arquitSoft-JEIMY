import { ErrorDominio } from './error-dominio';
import type { Usuario } from './usuario';

/** La operación dejaría al sistema sin ningún administrador activo (FR-020). */
export class ErrorUltimoAdministrador extends ErrorDominio {
  constructor() {
    super('Debe existir al menos un administrador activo');
    this.name = 'ErrorUltimoAdministrador';
  }
}

/**
 * El sistema nunca queda sin administrador activo (FR-020). Se evalúa con la lista de
 * administradores activos leída DENTRO de la transacción que modifica al usuario, con el bloqueo
 * que serializa estas operaciones (research.md §R-09).
 */
export const ReglaUltimoAdministrador = {
  /**
   * @param administradoresActivos ids de los administradores activos ANTES del cambio.
   * @param usuario el usuario modificado, DESPUÉS del cambio.
   */
  verificar(administradoresActivos: readonly string[], usuario: Usuario): void {
    const otros = administradoresActivos.filter((id) => id !== usuario.id);
    const sigueSiendoAdministrador = usuario.activo && usuario.tieneRol('ADMINISTRADOR');
    const eraAdministrador = administradoresActivos.includes(usuario.id);
    if (eraAdministrador && !sigueSiendoAdministrador && otros.length === 0) {
      throw new ErrorUltimoAdministrador();
    }
  },
};
