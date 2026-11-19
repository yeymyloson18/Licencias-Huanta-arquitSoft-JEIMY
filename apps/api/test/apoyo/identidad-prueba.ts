import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { leerOtpSimulado } from './redis-prueba';

// Apoyo de las pruebas de la 004: identidad del administrado y documentos, con los datos FICTICIOS
// del servicio de identificación simulado (specs/004-solicitud-consulta/quickstart.md).

export const TITULAR_PRUEBA_1 = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000001',
  fechaEmision: '2020-01-15',
  ruc: '10400000011',
  celular: '987000001',
} as const;

export const TITULAR_EXTRANJERO = {
  tipoDocumento: 'CE',
  numeroDocumento: '000123456',
  ruc: '15000123456',
  celular: '987000002',
} as const;

export const REPRESENTANTE_PRUEBA = {
  tipoDocumento: 'DNI',
  numeroDocumento: '40000002',
  fechaEmision: '2019-05-10',
} as const;

/** Documento reservado del simulado: responde "no disponible". */
export const DNI_SERVICIO_CAIDO = '49999999';

export const PDF_PRUEBA = Buffer.from('%PDF-1.4\n% documento ficticio de prueba\n%%EOF\n');
export const JPG_PRUEBA = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
export const PNG_PRUEBA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

export type DatosIdentidadPrueba = Record<string, unknown>;

export const verificarIdentidad = (app: INestApplication<App>, datos: DatosIdentidadPrueba) =>
  request(app.getHttpServer()).post('/api/v1/identidad/verificar').send(datos);

/** Confirma la identidad por el flujo real (código leído del envío simulado) y devuelve el token. */
export const confirmarIdentidad = async (
  app: INestApplication<App>,
  redis: Redis,
  datos: DatosIdentidadPrueba = TITULAR_PRUEBA_1,
): Promise<{ token: string; desafioId: string }> => {
  const paso1 = await verificarIdentidad(app, datos).expect(200);
  const desafioId = (paso1.body as { desafioId: string }).desafioId;
  const codigo = await leerOtpSimulado(redis, desafioId);
  const paso2 = await request(app.getHttpServer())
    .post('/api/v1/identidad/verificar-otp')
    .send({ desafioId, codigo })
    .expect(200);
  return { token: (paso2.body as { token: string }).token, desafioId };
};

export const subirDocumentoPrueba = (
  app: INestApplication<App>,
  token: string,
  contenido: Buffer = PDF_PRUEBA,
  nombre = 'solicitud.pdf',
) =>
  request(app.getHttpServer())
    .post('/api/v1/documentos')
    .set('Authorization', `Bearer ${token}`)
    .attach('archivo', contenido, nombre);

/** Sube un PDF y devuelve su `documentoId`. */
export const subirPdf = async (app: INestApplication<App>, token: string): Promise<string> => {
  const respuesta = await subirDocumentoPrueba(app, token).expect(201);
  return (respuesta.body as { documentoId: string }).documentoId;
};
