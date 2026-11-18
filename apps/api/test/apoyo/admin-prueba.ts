import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { iniciarSesionDePrueba } from './sesion-prueba';
import { crearUsuarioDePrueba, type UsuarioDePrueba } from './usuarios-prueba';

type Metodo = 'get' | 'post' | 'patch' | 'put';

/** Cliente HTTP con el token de un usuario; registra cada URL usada (no deben llevar datos personales). */
export interface ClienteConSesion {
  readonly usuario: UsuarioDePrueba;
  readonly token: string;
  readonly urls: string[];
  pedir(metodo: Metodo, ruta: string, cuerpo?: object): request.Test;
}

/** Crea un usuario con los roles dados, inicia sesión y devuelve un cliente con su token. */
export const clienteConRoles = async (
  app: INestApplication<App>,
  prisma: PrismaServicio,
  redis: Redis,
  roles: readonly Rol[],
  urls: string[] = [],
): Promise<ClienteConSesion> => {
  const usuario = await crearUsuarioDePrueba(prisma, { roles });
  const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);
  return {
    usuario,
    token: accessToken,
    urls,
    pedir(metodo, ruta, cuerpo) {
      const url = `/api/v1${ruta}`;
      urls.push(url);
      const peticion = request(app.getHttpServer())
        [metodo](url)
        .set('Authorization', `Bearer ${accessToken}`);
      return cuerpo === undefined ? peticion : peticion.send(cuerpo);
    },
  };
};
