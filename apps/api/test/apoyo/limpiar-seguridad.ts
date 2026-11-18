import type { PrismaClient } from '@prisma/client';

/**
 * Borra los datos del esquema `seguridad` que crean las pruebas (sesiones, códigos, asignaciones y
 * usuarios). No toca `seguridad.rol`, que cargan las migraciones.
 */
export const limpiarSeguridad = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$transaction([
    prisma.sesion.deleteMany(),
    prisma.verificacion_identidad.deleteMany(),
    prisma.codigo_otp.deleteMany(),
    prisma.usuario_rol.deleteMany(),
    prisma.usuario.deleteMany(),
  ]);
};
