import { PoliticaClave } from '../dominio/politica-clave';
import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { HasherClaves } from '../dominio/puertos/hasher-claves';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { ErrorClaveInvalida, ErrorUsuarioNoEncontrado } from './errores';

export interface DependenciasAsignarClaveTemporal {
  readonly usuarios: RepositorioUsuarios;
  readonly sesiones: RepositorioSesiones;
  readonly hasher: HasherClaves;
  readonly almacen: AlmacenVersionSeguridad;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
}

/**
 * El administrador asigna una clave temporal a quien olvidó la suya (FR-022b): la anterior deja de
 * servir, se cierran todas sus sesiones y en su siguiente ingreso debe cambiarla.
 */
export class AsignarClaveTemporal {
  constructor(private readonly d: DependenciasAsignarClaveTemporal) {}

  async ejecutar(usuarioId: string, claveTemporal: string): Promise<void> {
    const reglas = PoliticaClave.validar(claveTemporal);
    if (reglas.length > 0) {
      throw new ErrorClaveInvalida(reglas);
    }
    const huella = await this.d.hasher.huella(claveTemporal);

    const usuario = await this.d.usuarios.modificar(usuarioId, (actual) => {
      actual.asignarClaveTemporal(huella);
    });
    if (usuario === null) {
      throw new ErrorUsuarioNoEncontrado();
    }

    await this.d.almacen.publicarVersion(usuario.id, usuario.versionSeguridad);
    const revocadas = await this.d.sesiones.revocarTodasDelUsuario(
      usuario.id,
      this.d.reloj.ahora(),
    );
    await this.d.almacen.marcarSesionesRevocadas(revocadas);
    this.d.eventos.registrar('clave-temporal-asignada', { usuarioId: usuario.id });
  }
}
