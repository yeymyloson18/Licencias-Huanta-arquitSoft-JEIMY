import { randomUUID } from 'node:crypto';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { Celular } from '../../src/modulos/seguridad/dominio/celular';
import { Correo } from '../../src/modulos/seguridad/dominio/correo';
import { NombreCompleto } from '../../src/modulos/seguridad/dominio/nombre-completo';
import { Usuario } from '../../src/modulos/seguridad/dominio/usuario';
import { ProtectorDatosAesGcm } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
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

  describe('buscar y modificar (historia 5)', () => {
    const crearVarios = async () => {
      const nombres = ['Ana Quispe', 'Beto Huamán', 'Carla Rojas'];
      const creados: Usuario[] = [];
      for (const [i, nombre] of nombres.entries()) {
        const usuario = Usuario.crear({
          id: randomUUID(),
          correo: Correo.crear(`persona${String(i)}@ejemplo.pe`),
          nombreCompleto: NombreCompleto.crear(nombre),
          celular: Celular.crear('987654321'),
          claveHash: 'h',
          roles: i === 0 ? ['ADMINISTRADOR'] : ['CAJA'],
          asignadoPor: ADMIN,
          en: T0,
        });
        if (i === 2) {
          usuario.desactivar();
        }
        await repositorio.crear(usuario);
        creados.push(usuario);
      }
      return creados;
    };

    it('busca por fragmento del nombre, por correo exacto y por estado, paginado', async () => {
      await crearVarios();

      const porNombre = await repositorio.buscar({ texto: 'ROJ', pagina: 1, porPagina: 20 });
      expect(porNombre.usuarios.map((u) => u.nombreCompleto.valor)).toEqual(['Carla Rojas']);

      const porCorreo = await repositorio.buscar({
        texto: 'persona1@ejemplo.pe',
        correo: Correo.crear('PERSONA1@ejemplo.pe'),
        pagina: 1,
        porPagina: 20,
      });
      expect(porCorreo.usuarios.map((u) => u.nombreCompleto.valor)).toEqual(['Beto Huamán']);

      const inactivos = await repositorio.buscar({ activo: false, pagina: 1, porPagina: 20 });
      expect(inactivos.total).toBe(1);

      const pagina2 = await repositorio.buscar({ pagina: 2, porPagina: 2 });
      expect(pagina2.total).toBe(3);
      expect(pagina2.usuarios.map((u) => u.nombreCompleto.valor)).toEqual(['Carla Rojas']);
    });

    it('modificar entrega los administradores activos y guarda el cambio', async () => {
      const [admin, caja] = await crearVarios();
      let administradoresVistos: readonly string[] = [];

      const modificado = await repositorio.modificar(caja?.id ?? '', (usuario, administradores) => {
        administradoresVistos = administradores;
        usuario.reemplazarRoles(['JEFATURA'], ADMIN, new Date('2026-11-18T09:00:00.000Z'));
        return [];
      });

      expect(administradoresVistos).toEqual([admin?.id]);
      expect(modificado?.rolesVigentes).toEqual(['JEFATURA']);
      expect((await repositorio.obtenerPorId(caja?.id ?? ''))?.rolesVigentes).toEqual(['JEFATURA']);
    });

    it('si el cambio lanza un error no guarda nada', async () => {
      const [, caja] = await crearVarios();

      await expect(
        repositorio.modificar(caja?.id ?? '', (usuario) => {
          usuario.desactivar();
          throw new Error('rechazado');
        }),
      ).rejects.toThrow('rechazado');

      expect((await repositorio.obtenerPorId(caja?.id ?? ''))?.activo).toBe(true);
    });

    it('modificar un usuario inexistente devuelve null', async () => {
      await expect(repositorio.modificar(randomUUID(), () => undefined)).resolves.toBeNull();
      await expect(repositorio.modificar('no-es-uuid', () => undefined)).resolves.toBeNull();
    });
  });
});
