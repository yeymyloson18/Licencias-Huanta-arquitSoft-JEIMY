import { Celular } from '../dominio/celular';
import { Correo } from '../dominio/correo';
import { ErrorDominio } from '../dominio/error-dominio';
import { NombreCompleto } from '../dominio/nombre-completo';
import { PoliticaClave } from '../dominio/politica-clave';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { HasherClaves } from '../dominio/puertos/hasher-claves';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { Usuario } from '../dominio/usuario';
import { ErrorClaveInvalida, ErrorDatosInvalidos } from './errores';

export interface DependenciasCrearPrimerAdministrador {
  readonly usuarios: RepositorioUsuarios;
  readonly hasher: HasherClaves;
  readonly generador: GeneradorSecretos;
  readonly reloj: Reloj;
}

export interface DatosPrimerAdministrador {
  readonly correo: string;
  readonly nombre: string;
  readonly celular: string;
  readonly clave: string;
}

export type ResultadoPrimerAdministrador =
  | { readonly resultado: 'CREADO'; readonly usuarioId: string }
  | { readonly resultado: 'YA_EXISTE' }
  | { readonly resultado: 'CORREO_EN_USO' };

/** Convierte un texto en objeto de valor o anota el campo inválido (sin su valor). */
const leer = <T>(campo: string, invalidos: string[], crear: () => T): T | null => {
  try {
    return crear();
  } catch (error) {
    if (error instanceof ErrorDominio) {
      invalidos.push(campo);
      return null;
    }
    throw error;
  }
};

/**
 * Paso de instalación: crea el primer administrador si no hay ninguno activo (FR-023, FR-024). Es
 * idempotente: con un administrador activo no crea ni modifica nada. El usuario creado debe cambiar
 * la clave en su primer ingreso, porque la clave pasó por la terminal o por variables de entorno.
 */
export class CrearPrimerAdministrador {
  constructor(private readonly d: DependenciasCrearPrimerAdministrador) {}

  async ejecutar(datos: DatosPrimerAdministrador): Promise<ResultadoPrimerAdministrador> {
    const invalidos: string[] = [];
    const correo = leer('correo', invalidos, () => Correo.crear(datos.correo));
    const nombre = leer('nombre', invalidos, () => NombreCompleto.crear(datos.nombre));
    const celular = leer('celular', invalidos, () => Celular.crear(datos.celular));
    const reglas = PoliticaClave.validar(datos.clave);
    if (correo === null || nombre === null || celular === null) {
      // Un solo mensaje con todos los campos inválidos, también la clave si no cumple la política.
      throw new ErrorDatosInvalidos(reglas.length > 0 ? [...invalidos, 'clave'] : invalidos);
    }
    if (reglas.length > 0) {
      throw new ErrorClaveInvalida(reglas);
    }

    if (await this.d.usuarios.hayAdministradorActivo()) {
      return { resultado: 'YA_EXISTE' };
    }
    if ((await this.d.usuarios.obtenerPorCorreo(correo)) !== null) {
      return { resultado: 'CORREO_EN_USO' };
    }

    const id = this.d.generador.generarId();
    const usuario = Usuario.crear({
      id,
      correo,
      nombreCompleto: nombre,
      celular,
      claveHash: await this.d.hasher.huella(datos.clave),
      roles: ['ADMINISTRADOR'],
      asignadoPor: id,
      en: this.d.reloj.ahora(),
    });

    const creado = await this.d.usuarios.crearSiNoHayAdministradores(usuario);
    return creado ? { resultado: 'CREADO', usuarioId: id } : { resultado: 'YA_EXISTE' };
  }
}
