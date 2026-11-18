import { Celular } from '../dominio/celular';
import { Correo } from '../dominio/correo';
import { NombreCompleto } from '../dominio/nombre-completo';
import { PoliticaClave } from '../dominio/politica-clave';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { HasherClaves } from '../dominio/puertos/hasher-claves';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import type { Rol } from '../dominio/rol';
import { Usuario } from '../dominio/usuario';
import { ErrorClaveInvalida, ErrorCorreoEnUso, ErrorDatosInvalidos } from './errores';
import { leerCampo } from './leer-campos';

export interface DependenciasCrearUsuario {
  readonly usuarios: RepositorioUsuarios;
  readonly hasher: HasherClaves;
  readonly generador: GeneradorSecretos;
  readonly reloj: Reloj;
}

export interface DatosNuevoUsuario {
  readonly correo: string;
  readonly nombreCompleto: string;
  readonly celular: string;
  readonly claveTemporal: string;
  readonly roles: readonly Rol[];
}

/**
 * El administrador crea un usuario del personal (FR-017): activo, con al menos un rol y con una
 * clave temporal que el usuario debe cambiar en su primer ingreso (FR-022). Se registra quién
 * asignó cada rol y cuándo (FR-019).
 */
export class CrearUsuario {
  constructor(private readonly d: DependenciasCrearUsuario) {}

  async ejecutar(datos: DatosNuevoUsuario, porUsuarioId: string): Promise<Usuario> {
    const invalidos: string[] = [];
    const correo = leerCampo('correo', invalidos, () => Correo.crear(datos.correo));
    const nombre = leerCampo('nombreCompleto', invalidos, () =>
      NombreCompleto.crear(datos.nombreCompleto),
    );
    const celular = leerCampo('celular', invalidos, () => Celular.crear(datos.celular));
    if (datos.roles.length === 0) {
      invalidos.push('roles');
    }
    if (correo === null || nombre === null || celular === null || invalidos.length > 0) {
      throw new ErrorDatosInvalidos(invalidos);
    }

    const reglas = PoliticaClave.validar(datos.claveTemporal);
    if (reglas.length > 0) {
      throw new ErrorClaveInvalida(reglas);
    }
    if ((await this.d.usuarios.obtenerPorCorreo(correo)) !== null) {
      throw new ErrorCorreoEnUso();
    }

    const usuario = Usuario.crear({
      id: this.d.generador.generarId(),
      correo,
      nombreCompleto: nombre,
      celular,
      claveHash: await this.d.hasher.huella(datos.claveTemporal),
      roles: datos.roles,
      asignadoPor: porUsuarioId,
      en: this.d.reloj.ahora(),
    });
    await this.d.usuarios.crear(usuario);
    return usuario;
  }
}
