import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../../app.module';
import { ErrorConfiguracion } from '../../../../compartido/infraestructura/configuracion';
import {
  CrearPrimerAdministrador,
  type ResultadoPrimerAdministrador,
} from '../../aplicacion/crear-primer-administrador';
import { ErrorClaveInvalida, ErrorDatosInvalidos } from '../../aplicacion/errores';
import { preguntarEnTerminal } from './preguntar';

// Paso de instalación que crea el primer administrador (historia 3, FR-023, FR-024;
// specs/002-seguridad-usuarios/contracts/crear-administrador.md).
//   npm run crear-administrador                          (local, con DATABASE_URL y las claves)
//   docker compose -f infra/docker-compose.yml exec api npm run crear-administrador
// Nunca imprime ni registra el correo, el celular ni la clave.

export const CODIGO_OK = 0;
export const CODIGO_CORREO_EN_USO = 1;
export const CODIGO_DATOS_INVALIDOS = 2;
export const CODIGO_SIN_BASE_DE_DATOS = 3;

export interface OpcionesCrearAdministrador {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Si hay una terminal interactiva para pedir los datos que falten. */
  readonly esTerminal: boolean;
  readonly escribir: (texto: string) => void;
  readonly escribirError: (texto: string) => void;
  readonly preguntar?: (pregunta: string, oculto: boolean) => Promise<string>;
  readonly crearContexto?: () => Promise<INestApplicationContext>;
}

const VARIABLES = [
  { variable: 'ADMIN_CORREO', pregunta: 'Correo: ', oculto: false },
  { variable: 'ADMIN_NOMBRE', pregunta: 'Nombre completo: ', oculto: false },
  { variable: 'ADMIN_CELULAR', pregunta: 'Celular (9 dígitos): ', oculto: false },
  { variable: 'ADMIN_CLAVE', pregunta: 'Clave: ', oculto: true },
] as const;

type Variable = (typeof VARIABLES)[number]['variable'];

const crearContextoPorDefecto = () =>
  NestFactory.createApplicationContext(AppModule, { logger: false });

/** Reúne los datos de las variables de entorno y, si hay terminal, pregunta los que falten. */
const reunirDatos = async (
  opciones: OpcionesCrearAdministrador,
): Promise<Record<Variable, string> | { readonly faltan: string[] } | null> => {
  const datos: Partial<Record<Variable, string>> = {};
  for (const { variable } of VARIABLES) {
    const valor = opciones.env[variable]?.trim();
    if (valor !== undefined && valor !== '') {
      datos[variable] = valor;
    }
  }

  const faltan = VARIABLES.filter(({ variable }) => datos[variable] === undefined);
  if (faltan.length > 0 && !opciones.esTerminal) {
    return { faltan: faltan.map(({ variable }) => variable) };
  }

  const preguntar = opciones.preguntar ?? preguntarEnTerminal;
  for (const { variable, pregunta, oculto } of faltan) {
    datos[variable] = await preguntar(pregunta, oculto);
    if (variable === 'ADMIN_CLAVE') {
      const repetida = await preguntar('Repita la clave: ', true);
      if (repetida !== datos.ADMIN_CLAVE) {
        return null;
      }
    }
  }

  return {
    ADMIN_CORREO: datos.ADMIN_CORREO ?? '',
    ADMIN_NOMBRE: datos.ADMIN_NOMBRE ?? '',
    ADMIN_CELULAR: datos.ADMIN_CELULAR ?? '',
    ADMIN_CLAVE: datos.ADMIN_CLAVE ?? '',
  };
};

/** Escribe el mensaje del contrato para cada resultado y devuelve el código de salida. */
const responder = (
  resultado: ResultadoPrimerAdministrador,
  opciones: OpcionesCrearAdministrador,
): number => {
  switch (resultado.resultado) {
    case 'CREADO':
      opciones.escribir(
        `Administrador creado. Id: ${resultado.usuarioId}. Deberá cambiar la clave en su primer ingreso.\n`,
      );
      return CODIGO_OK;
    case 'YA_EXISTE':
      opciones.escribir('Ya existe un administrador activo; no se hizo ningún cambio.\n');
      return CODIGO_OK;
    case 'CORREO_EN_USO':
      opciones.escribirError('El correo ya está en uso.\n');
      return CODIGO_CORREO_EN_USO;
  }
};

/** Ejecuta el comando y devuelve el código de salida (0, 1, 2 o 3). */
export async function ejecutarCrearAdministrador(
  opciones: OpcionesCrearAdministrador,
): Promise<number> {
  const datos = await reunirDatos(opciones);
  if (datos === null) {
    opciones.escribirError('Las claves no coinciden.\n');
    return CODIGO_DATOS_INVALIDOS;
  }
  if ('faltan' in datos) {
    opciones.escribirError(`Faltan variables: ${datos.faltan.join(', ')}\n`);
    return CODIGO_DATOS_INVALIDOS;
  }

  let contexto: INestApplicationContext | undefined;
  try {
    contexto = await (opciones.crearContexto ?? crearContextoPorDefecto)();
    const resultado = await contexto.get(CrearPrimerAdministrador).ejecutar({
      correo: datos.ADMIN_CORREO,
      nombre: datos.ADMIN_NOMBRE,
      celular: datos.ADMIN_CELULAR,
      clave: datos.ADMIN_CLAVE,
    });

    return responder(resultado, opciones);
  } catch (error) {
    if (error instanceof ErrorDatosInvalidos) {
      opciones.escribirError(`Datos inválidos: ${error.campos.join(', ')}\n`);
      return CODIGO_DATOS_INVALIDOS;
    }
    if (error instanceof ErrorClaveInvalida) {
      opciones.escribirError(
        'Datos inválidos: clave (al menos 12 caracteres, con letras y números)\n',
      );
      return CODIGO_DATOS_INVALIDOS;
    }
    if (error instanceof ErrorConfiguracion) {
      // Solo nombra las variables de configuración, nunca sus valores.
      opciones.escribirError(`${error.message}\n`);
      return CODIGO_DATOS_INVALIDOS;
    }
    opciones.escribirError('No se pudo conectar con la base de datos.\n');
    return CODIGO_SIN_BASE_DE_DATOS;
  } finally {
    await contexto?.close();
  }
}

if (require.main === module) {
  void ejecutarCrearAdministrador({
    env: process.env,
    esTerminal: process.stdin.isTTY,
    escribir: (texto) => process.stdout.write(texto),
    escribirError: (texto) => process.stderr.write(texto),
  }).then((codigo) => {
    process.exitCode = codigo;
  });
}
