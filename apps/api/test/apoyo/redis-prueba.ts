import type Redis from 'ioredis';

/** Lee el último código que envió el envío simulado al usuario (research.md §R-11). */
export const leerOtpSimulado = async (redis: Redis, usuarioId: string): Promise<string> => {
  const codigo = await redis.get(`dev:otp:${usuarioId}`);
  if (codigo === null) {
    throw new Error('No hay código simulado para el usuario de la prueba');
  }
  return codigo;
};

/** Borra los contadores de intentos, las versiones de seguridad y los códigos simulados. */
export const limpiarClavesSeguridad = async (redis: Redis): Promise<void> => {
  for (const patron of ['lim:*', 'seg:*', 'dev:otp:*']) {
    const claves = await redis.keys(patron);
    if (claves.length > 0) {
      await redis.del(...claves);
    }
  }
};

/** 012: borra los contadores del límite de preguntas del chat de orientación (`lim:orientacion:*`). */
export const limpiarLimiteOrientacion = async (redis: Redis): Promise<void> => {
  const claves = await redis.keys('lim:orientacion:*');
  if (claves.length > 0) {
    await redis.del(...claves);
  }
};
