import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { leerOtpSimulado } from './redis-prueba';
import type { UsuarioDePrueba } from './usuarios-prueba';

export interface SesionDePrueba {
  readonly accessToken: string;
  /** `refresh_personal=<valor>` listo para la cabecera Cookie. */
  readonly cookie: string;
}

const cookieDe = (respuesta: Response): string => {
  const cabecera = respuesta.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cabecera?.find((linea) => linea.startsWith('refresh_personal='));
  return cookie?.split(';')[0] ?? '';
};

/** Inicia sesión por el flujo real en dos pasos (código leído del envío simulado). */
export const iniciarSesionDePrueba = async (
  app: INestApplication<App>,
  redis: Redis,
  usuario: UsuarioDePrueba,
): Promise<SesionDePrueba> => {
  const paso1 = await request(app.getHttpServer())
    .post('/api/v1/auth/iniciar-sesion')
    .send({ correo: usuario.correo, clave: usuario.clave })
    .expect(200);
  const codigo = await leerOtpSimulado(redis, usuario.id);
  const paso2 = await request(app.getHttpServer())
    .post('/api/v1/auth/verificar-otp')
    .send({ desafioId: (paso1.body as { desafioId: string }).desafioId, codigo })
    .expect(200);
  return {
    accessToken: (paso2.body as { accessToken: string }).accessToken,
    cookie: cookieDe(paso2),
  };
};

/**
 * Simula lo que hará la gestión de usuarios (US5) sin depender de ella: cambia el usuario en la base,
 * sube su versión de seguridad y publica la versión nueva en Redis (research.md §R-07).
 */
export const modificarUsuarioDePrueba = async (
  prisma: PrismaServicio,
  redis: Redis,
  usuarioId: string,
  cambio: { readonly desactivar?: boolean; readonly retirarRol?: Rol },
): Promise<void> => {
  const ahora = new Date();
  if (cambio.desactivar === true) {
    await prisma.usuario.update({ where: { id: usuarioId }, data: { activo: false } });
  }
  if (cambio.retirarRol !== undefined) {
    await prisma.usuario_rol.updateMany({
      where: { usuario_id: usuarioId, rol_codigo: cambio.retirarRol, retirado_en: null },
      data: { retirado_por: usuarioId, retirado_en: ahora },
    });
  }
  const { version_seguridad: version } = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { version_seguridad: { increment: 1 } },
    select: { version_seguridad: true },
  });
  await redis.set(`seg:version:${usuarioId}`, String(version), 'EX', 60);
};
