import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import type { ProtectorDatos } from '../compartido/dominio/protector-datos';
import { PrismaServicio } from '../compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../compartido/infraestructura/protector-datos-aes-gcm';
import { FachadaCatalogo } from '../modulos/catalogo/fachada';
import { Celular } from '../modulos/seguridad/dominio/celular';
import { Correo } from '../modulos/seguridad/dominio/correo';
import { NombreCompleto } from '../modulos/seguridad/dominio/nombre-completo';
import { ROLES, type Rol } from '../modulos/seguridad/dominio/rol';
import { Usuario } from '../modulos/seguridad/dominio/usuario';
import { HasherClavesArgon2 } from '../modulos/seguridad/infraestructura/hasher-claves-argon2';
import { RepositorioUsuariosPostgres } from '../modulos/seguridad/infraestructura/repositorio-usuarios-postgres';

// Datos de demostración (FR-039 de la 007, research §R-12):
//   docker compose exec api-a node dist/scripts/sembrar-demostracion.js            (producción)
//   docker compose -f infra/docker-compose.yml exec -T api node dist/scripts/sembrar-demostracion.js --salida -
// Crea un usuario por rol con una clave aleatoria (se muestra UNA sola vez en la terminal) y 3
// expedientes de ejemplo con titulares FICTICIOS. Ejecutarlo de nuevo no duplica nada; con
// --regenerar pone claves nuevas a los usuarios de demostración. `--salida -` imprime JSON (para las
// pruebas E2E) y se rechaza en producción. Nunca escribe claves en archivos ni en el logger.

export const CODIGO_OK = 0;
export const CODIGO_SALIDA_EN_PRODUCCION = 2;

export interface UsuarioDemostracion {
  readonly rol: Rol;
  readonly id: string;
  readonly correo: string;
  /** `null` si el usuario ya existía y no se pidió --regenerar. */
  readonly clave: string | null;
}

export interface OpcionesSiembra {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly escribir: (texto: string) => void;
  readonly crearContexto?: () => Promise<INestApplicationContext>;
}

const NOMBRE_COMERCIAL = 'Demostración';

/** Titulares FICTICIOS de los expedientes de ejemplo (rutas A, B y C). */
const EJEMPLOS = [
  { codigoReceta: 'LIC-02', nombre: 'Rosa Demo Quispe', documento: '41000001', giro: 'Bodega' },
  {
    codigoReceta: 'LIC-03',
    nombre: 'Luis Demo Huamán',
    documento: '41000002',
    giro: 'Restaurante',
  },
  { codigoReceta: 'LIC-09', nombre: 'Ana Demo Ccori', documento: '41000003', giro: 'Bodega' },
] as const;

const correoDe = (rol: Rol) => `demo.${rol.toLowerCase().replace('_', '-')}@ejemplo.pe`;
const celularDe = (indice: number) => `9000000${String(indice + 10).padStart(2, '0')}`;
/** 17 caracteres con letras y un número (cumple la política de clave de la 002). */
const claveAleatoria = () => `Demo${randomBytes(9).toString('base64url')}7`;

const crearContextoPorDefecto = () =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment
  NestFactory.createApplicationContext(AppModule, { logger: false });

const sembrarUsuarios = async (
  prisma: PrismaServicio,
  protector: ProtectorDatos,
  regenerar: boolean,
): Promise<UsuarioDemostracion[]> => {
  const repositorio = new RepositorioUsuariosPostgres(prisma, protector);
  const hasher = new HasherClavesArgon2();
  const usuarios: UsuarioDemostracion[] = [];
  for (const [indice, rol] of ROLES.entries()) {
    const correo = correoDe(rol);
    const existente = await repositorio.obtenerPorCorreo(Correo.crear(correo));
    if (existente !== null) {
      let clave: string | null = null;
      if (regenerar) {
        clave = claveAleatoria();
        existente.cambiarClave(await hasher.huella(clave));
        await repositorio.guardar(existente);
      }
      usuarios.push({ rol, id: existente.id, correo, clave });
      continue;
    }
    const clave = claveAleatoria();
    const id = randomUUID();
    const usuario = Usuario.crear({
      id,
      correo: Correo.crear(correo),
      nombreCompleto: NombreCompleto.crear(`Persona de demostración (${rol})`),
      celular: Celular.crear(celularDe(indice)),
      claveHash: await hasher.huella(clave),
      roles: [rol],
      asignadoPor: id,
      en: new Date(),
    });
    // Clave definitiva: el usuario de demostración entra sin cambiarla.
    usuario.cambiarClave(usuario.claveHash);
    await repositorio.crear(usuario);
    usuarios.push({ rol, id, correo, clave });
  }
  return usuarios;
};

const sembrarExpedientes = async (
  prisma: PrismaServicio,
  protector: ProtectorDatos,
  catalogo: FachadaCatalogo,
): Promise<string[]> => {
  if ((await prisma.expediente.count({ where: { nombre_comercial: NOMBRE_COMERCIAL } })) > 0) {
    return [];
  }
  const bytes = (texto: string) => Buffer.from(protector.cifrar(texto));
  const huella = (texto: string) => Buffer.from(protector.hmac(texto));
  const numeros: string[] = [];
  for (const ejemplo of EJEMPLOS) {
    const receta = await catalogo.obtenerRecetaVigente(ejemplo.codigoReceta);
    if (receta === null) {
      continue;
    }
    const [{ correlativo }] = await prisma.$queryRaw<[{ correlativo: bigint }]>`
      SELECT nextval('tramites.numero_expediente_seq') AS correlativo`;
    const ahora = new Date();
    const numero = `EXP-${String(ahora.getFullYear())}-${String(correlativo).padStart(6, '0')}`;
    await prisma.expediente.create({
      data: {
        numero,
        codigo_receta: receta.codigo,
        ruta: receta.ruta,
        estado: 'REGISTRADO',
        canal: 'MESA_PARTES',
        tipo_documento: 'DNI',
        documento_cifrado: bytes(ejemplo.documento),
        documento_hmac: huella(ejemplo.documento),
        ruc_cifrado: bytes(`10${ejemplo.documento}1`),
        ruc_hmac: huella(`10${ejemplo.documento}1`),
        nombre_titular: ejemplo.nombre,
        celular_cifrado: bytes('900000099'),
        correo_cifrado: null,
        nombre_comercial: NOMBRE_COMERCIAL,
        giro: ejemplo.giro,
        direccion_cifrada: bytes('Jr. Demostración 100, Huanta'),
        zona: 'Centro',
        area_m2: new Prisma.Decimal('40.00'),
        presentado_en: ahora,
        registrado_por: randomUUID(),
        receta_al_presentar: receta as unknown as Prisma.InputJsonValue,
        con_representante: false,
        historial_estado: {
          create: {
            estado_anterior: null,
            estado_nuevo: 'REGISTRADO',
            comentario: 'Expediente de demostración',
            ocurrido_en: ahora,
          },
        },
      },
    });
    numeros.push(numero);
  }
  return numeros;
};

/** Ejecuta la siembra y devuelve el código de salida. */
export const ejecutarSiembra = async (opciones: OpcionesSiembra): Promise<number> => {
  const salidaJson = opciones.argv.includes('--salida');
  if (salidaJson && opciones.env.NODE_ENV === 'production') {
    opciones.escribir('--salida solo se permite fuera de producción.\n');
    return CODIGO_SALIDA_EN_PRODUCCION;
  }
  const contexto = await (opciones.crearContexto ?? crearContextoPorDefecto)();
  try {
    const prisma = contexto.get(PrismaServicio);
    const protector = contexto.get<ProtectorDatos>(PROTECTOR_DATOS);
    const usuarios = await sembrarUsuarios(
      prisma,
      protector,
      opciones.argv.includes('--regenerar'),
    );
    const expedientes = await sembrarExpedientes(prisma, protector, contexto.get(FachadaCatalogo));
    if (salidaJson) {
      opciones.escribir(`${JSON.stringify({ usuarios, expedientes })}\n`);
      return CODIGO_OK;
    }
    opciones.escribir('Usuarios de demostración (las claves se muestran UNA sola vez):\n');
    for (const usuario of usuarios) {
      opciones.escribir(
        `  ${usuario.rol.padEnd(14)} ${usuario.correo.padEnd(34)} ${usuario.clave ?? '(ya existía; use --regenerar)'}\n`,
      );
    }
    opciones.escribir(
      expedientes.length > 0
        ? `Expedientes de ejemplo creados: ${expedientes.join(', ')}\n`
        : 'Los expedientes de ejemplo ya existían.\n',
    );
    return CODIGO_OK;
  } finally {
    await contexto.close();
  }
};

/* istanbul ignore next -- punto de entrada del comando */
if (require.main === module) {
  void ejecutarSiembra({
    argv: process.argv.slice(2),
    env: process.env,
    escribir: (texto) => process.stdout.write(texto),
  }).then((codigo) => {
    process.exitCode = codigo;
  });
}
