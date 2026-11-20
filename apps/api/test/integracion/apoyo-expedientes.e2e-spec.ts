import { randomUUID } from 'node:crypto';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { ProtectorDatosAesGcm } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';

// Comprueba el apoyo `sembrarExpediente` (T016 de la 004) contra las restricciones de la migración
// 0006: lo que siembra es un expediente válido, y las reglas de la base rechazan uno inválido.

const prisma = new PrismaServicio();
const protector = new ProtectorDatosAesGcm(
  Buffer.from(process.env.CLAVE_CIFRADO_DATOS ?? '', 'base64'),
  Buffer.from(process.env.CLAVE_HMAC_DATOS ?? '', 'base64'),
);

describe('Apoyo de pruebas: expedientes sembrados (004)', () => {
  beforeEach(async () => {
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await prisma.$disconnect();
  });

  it('siembra un expediente REGISTRADO con número, receta al presentar, datos cifrados e historial', async () => {
    const sembrado = await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-03' });

    expect(sembrado.numero).toMatch(/^EXP-[0-9]{4}-[0-9]{6}$/);
    expect(sembrado.ruta).toBe('B');
    const fila = await prisma.expediente.findUniqueOrThrow({
      where: { id: sembrado.id },
      include: { historial_estado: true },
    });
    expect(fila.estado).toBe('REGISTRADO');
    expect(fila.receta_al_presentar).toMatchObject({ codigo: 'LIC-03', tasa: '305.90' });
    expect(protector.descifrar(fila.documento_cifrado)).toBe(TITULAR_DE_PRUEBA.documento);
    expect(Buffer.from(fila.documento_cifrado).toString('utf8')).not.toContain(
      TITULAR_DE_PRUEBA.documento,
    );
    expect(fila.historial_estado.map((registro) => registro.estado_nuevo)).toEqual(['REGISTRADO']);
  });

  it('siembra expedientes de mesa de partes y con representante', async () => {
    const presencial = await sembrarExpediente(prisma, protector, {
      canal: 'MESA_PARTES',
      conRepresentante: true,
    });

    const fila = await prisma.expediente.findUniqueOrThrow({ where: { id: presencial.id } });
    expect(fila.registrado_por).not.toBeNull();
    expect(fila.verificacion_id).toBeNull();
    expect(fila.con_representante).toBe(true);
  });

  it('la base rechaza un número con otro formato', async () => {
    const sembrado = await sembrarExpediente(prisma, protector);

    await expect(
      prisma.expediente.update({ where: { id: sembrado.id }, data: { numero: 'EXP-26-1' } }),
    ).rejects.toThrow();
  });

  it('la base rechaza usar el mismo permiso de identidad en dos expedientes', async () => {
    const primero = await sembrarExpediente(prisma, protector);
    const segundo = await sembrarExpediente(prisma, protector);
    const { verificacion_id: verificacion } = await prisma.expediente.findUniqueOrThrow({
      where: { id: primero.id },
    });

    await expect(
      prisma.expediente.update({
        where: { id: segundo.id },
        data: { verificacion_id: verificacion },
      }),
    ).rejects.toThrow();
  });

  it('la base exige la verificación en línea y el usuario en mesa de partes', async () => {
    const enLinea = await sembrarExpediente(prisma, protector);

    await expect(
      prisma.expediente.update({ where: { id: enLinea.id }, data: { verificacion_id: null } }),
    ).rejects.toThrow();
    await expect(
      prisma.expediente.update({
        where: { id: enLinea.id },
        data: { canal: 'MESA_PARTES', registrado_por: randomUUID() },
      }),
    ).rejects.toThrow();
  });
});
