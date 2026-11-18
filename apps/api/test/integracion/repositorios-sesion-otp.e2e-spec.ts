import { randomUUID } from 'node:crypto';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { CodigoOtp } from '../../src/modulos/seguridad/dominio/codigo-otp';
import { Sesion } from '../../src/modulos/seguridad/dominio/sesion';
import { RepositorioCodigosOtpPostgres } from '../../src/modulos/seguridad/infraestructura/repositorio-codigos-otp-postgres';
import { RepositorioSesionesPostgres } from '../../src/modulos/seguridad/infraestructura/repositorio-sesiones-postgres';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';

// Requiere PostgreSQL con las migraciones aplicadas (incluida 0003).
const prisma = new PrismaServicio();
const codigos = new RepositorioCodigosOtpPostgres(prisma);
const sesiones = new RepositorioSesionesPostgres(prisma);

const T0 = new Date('2026-11-17T10:00:00.000Z');
const despues = (segundos: number) => new Date(T0.getTime() + segundos * 1000);

describe('RepositorioCodigosOtpPostgres', () => {
  let usuarioId: string;

  beforeEach(async () => {
    await limpiarSeguridad(prisma);
    usuarioId = (await crearUsuarioDePrueba(prisma)).id;
  });
  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await prisma.$disconnect();
  });

  const nuevo = (id = randomUUID()) =>
    CodigoOtp.crear({
      id,
      usuarioId,
      destinoHmac: new Uint8Array([7, 7, 7]),
      codigoHash: 'huella',
      creadoEn: T0,
    });

  it('crea, lee y guarda intentos y uso', async () => {
    const codigo = nuevo();
    await codigos.crear(codigo);

    const leido = await codigos.obtenerPorId(codigo.id);
    expect(leido?.venceEn).toEqual(despues(300));
    expect(leido?.codigoHash).toBe('huella');
    expect(Array.from(leido?.destinoHmac ?? [])).toEqual([7, 7, 7]);

    leido?.verificar(false, despues(1));
    leido?.verificar(true, despues(2));
    if (leido) {
      await codigos.guardar(leido);
    }
    const final = await codigos.obtenerPorId(codigo.id);
    expect(final?.intentos).toBe(1);
    expect(final?.usadoEn).toEqual(despues(2));
  });

  it('guarda el propósito INICIO_SESION', async () => {
    const codigo = nuevo();
    await codigos.crear(codigo);

    const fila = await prisma.codigo_otp.findUniqueOrThrow({ where: { id: codigo.id } });
    expect(fila.proposito).toBe('INICIO_SESION');
  });

  it('vence los códigos vigentes del usuario', async () => {
    const primero = nuevo();
    await codigos.crear(primero);

    await codigos.vencerVigentesDelUsuario(usuarioId, despues(30));

    expect((await codigos.obtenerPorId(primero.id))?.verificar(true, despues(31))).toBe('VENCIDO');
  });

  it.each(['no-es-uuid', randomUUID()])(
    'devuelve null para un id inválido o inexistente (%s)',
    async (id) => {
      await expect(codigos.obtenerPorId(id)).resolves.toBeNull();
    },
  );
});

describe('RepositorioSesionesPostgres', () => {
  let usuarioId: string;

  beforeEach(async () => {
    await limpiarSeguridad(prisma);
    usuarioId = (await crearUsuarioDePrueba(prisma)).id;
  });

  const nueva = (id = randomUUID()) =>
    Sesion.crear({ id, usuarioId, refreshHash: 'h0', creadaEn: T0 });

  it('crea, lee y guarda la rotación', async () => {
    const sesion = nueva();
    await sesiones.crear(sesion);
    sesion.renovar('h0', 'h1', despues(60), (a, b) => a === b);
    await sesiones.guardar(sesion);

    const leida = await sesiones.obtenerPorId(sesion.id);
    expect(leida?.refreshHash).toBe('h1');
    expect(leida?.refreshAnteriorHash).toBe('h0');
    expect(leida?.rotadaEn).toEqual(despues(60));
    expect(leida?.ultimaActividadEn).toEqual(despues(60));
    expect(leida?.venceMaximoEn).toEqual(despues(8 * 3600));
    expect(leida?.revocada).toBe(false);
  });

  it('revoca todas las sesiones vigentes del usuario y devuelve sus ids', async () => {
    const a = nueva();
    const b = nueva();
    await sesiones.crear(a);
    await sesiones.crear(b);

    const ids = await sesiones.revocarTodasDelUsuario(usuarioId, despues(5));

    expect(ids.sort()).toEqual([a.id, b.id].sort());
    expect((await sesiones.obtenerPorId(a.id))?.revocadaEn).toEqual(despues(5));
    await expect(sesiones.revocarTodasDelUsuario(usuarioId, despues(6))).resolves.toEqual([]);
  });

  it('revoca todas menos la indicada', async () => {
    const actual = nueva();
    const otra = nueva();
    await sesiones.crear(actual);
    await sesiones.crear(otra);

    await expect(sesiones.revocarTodasMenos(usuarioId, actual.id, despues(5))).resolves.toEqual([
      otra.id,
    ]);
    expect((await sesiones.obtenerPorId(actual.id))?.revocada).toBe(false);
  });

  it('devuelve null para un id inválido', async () => {
    await expect(sesiones.obtenerPorId('no-es-uuid')).resolves.toBeNull();
  });
});
