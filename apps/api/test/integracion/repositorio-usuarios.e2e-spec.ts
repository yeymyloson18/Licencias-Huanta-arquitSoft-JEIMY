import { randomUUID } from 'node:crypto';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { Celular } from '../../src/modulos/seguridad/dominio/celular';
import { Correo } from '../../src/modulos/seguridad/dominio/correo';
import { NombreCompleto } from '../../src/modulos/seguridad/dominio/nombre-completo';
import { Usuario } from '../../src/modulos/seguridad/dominio/usuario';
import { ProtectorDatosAesGcm } from '../../src/modulos/seguridad/infraestructura/protector-datos-aes-gcm';
import { RepositorioUsuariosPostgres } from '../../src/modulos/seguridad/infraestructura/repositorio-usuarios-postgres';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';

// Requiere PostgreSQL con las migraciones aplicadas (incluida 0003).
const prisma = new PrismaServicio();
const protector = new ProtectorDatosAesGcm(
  Buffer.from(process.env.CLAVE_CIFRADO_DATOS ?? '', 'base64'),
  Buffer.from(process.env.CLAVE_HMAC_DATOS ?? '', 'base64'),
);
const repositorio = new RepositorioUsuariosPostgres(prisma, protector);

const ADMIN = randomUUID();
const T0 = new Date('2026-11-17T10:00:00.000Z');

const nuevoUsuario = (correo = 'persona.repositorio@ejemplo.pe') =>
  Usuario.crear({
    id: randomUUID(),
    correo: Correo.crear(correo),
    nombreCompleto: NombreCompleto.crear('Persona del Repositorio'),
    celular: Celular.crear('987654321'),
    claveHash: '$argon2id$huella-de-prueba',
    roles: ['CAJA', 'JEFATURA'],
    asignadoPor: ADMIN,
    en: T0,
  });

describe('RepositorioUsuariosPostgres', () => {
  beforeEach(() => limpiarSeguridad(prisma));
  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await prisma.$disconnect();
  });

  it('crea y lee por id con sus roles vigentes', async () => {
    const usuario = nuevoUsuario();
    await repositorio.crear(usuario);

    const leido = await repositorio.obtenerPorId(usuario.id);

    expect(leido?.correo.valor).toBe('persona.repositorio@ejemplo.pe');
    expect(leido?.nombreCompleto.valor).toBe('Persona del Repositorio');
    expect(leido?.celular.valor).toBe('987654321');
    expect(leido?.rolesVigentes.sort()).toEqual(['CAJA', 'JEFATURA']);
    expect(leido?.debeCambiarClave).toBe(true);
    expect(leido?.versionSeguridad).toBe(1);
    expect(leido?.asignaciones[0]?.asignadoPor).toBe(ADMIN);
  });

  it('busca por correo sin distinguir mayúsculas (HMAC del correo normalizado)', async () => {
    const usuario = nuevoUsuario();
    await repositorio.crear(usuario);

    expect(
      (await repositorio.obtenerPorCorreo(Correo.crear('PERSONA.Repositorio@ejemplo.pe')))?.id,
    ).toBe(usuario.id);
    expect(await repositorio.obtenerPorCorreo(Correo.crear('otra@ejemplo.pe'))).toBeNull();
  });

  it('guarda el correo y el celular cifrados, nunca en claro', async () => {
    const usuario = nuevoUsuario();
    await repositorio.crear(usuario);

    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });

    expect(Buffer.from(fila.correo_cifrado).toString('latin1')).not.toContain(
      'persona.repositorio',
    );
    expect(Buffer.from(fila.celular_cifrado).toString('latin1')).not.toContain('987654321');
    expect(fila.correo_hmac).toHaveLength(32);
  });

  it('guardar actualiza los datos, retira roles sin borrarlos y crea los nuevos', async () => {
    const usuario = nuevoUsuario();
    await repositorio.crear(usuario);
    const leido = await repositorio.obtenerPorId(usuario.id);
    if (leido === null) {
      throw new Error('No se leyó el usuario');
    }

    leido.cambiarNombre(NombreCompleto.crear('Nombre Cambiado'));
    leido.reemplazarRoles(['JEFATURA', 'EVALUADOR'], ADMIN, new Date('2026-11-17T11:00:00.000Z'));
    leido.desactivar();
    await repositorio.guardar(leido);

    const final = await repositorio.obtenerPorId(usuario.id);
    expect(final?.nombreCompleto.valor).toBe('Nombre Cambiado');
    expect(final?.rolesVigentes.sort()).toEqual(['EVALUADOR', 'JEFATURA']);
    expect(final?.activo).toBe(false);
    expect(final?.versionSeguridad).toBe(3);

    const filas = await prisma.usuario_rol.findMany({ where: { usuario_id: usuario.id } });
    const caja = filas.find((fila) => fila.rol_codigo === 'CAJA');
    expect(filas).toHaveLength(3);
    expect(caja?.retirado_por).toBe(ADMIN);
    expect(caja?.retirado_en?.toISOString()).toBe('2026-11-17T11:00:00.000Z');
  });

  it('rechaza un segundo usuario con el mismo correo (índice único de correo_hmac)', async () => {
    await repositorio.crear(nuevoUsuario('repetido@ejemplo.pe'));

    await expect(repositorio.crear(nuevoUsuario('Repetido@Ejemplo.pe'))).rejects.toThrow();
  });
});
