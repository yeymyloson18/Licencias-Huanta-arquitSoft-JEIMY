import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { versionDe } from './evaluacion-prueba';
import { JPG_PRUEBA } from './identidad-prueba';
import { procesarTodo } from './itse-prueba';

// Recorrido completo de la 006 por HTTP, desde un expediente REGISTRADO hasta el final de su ruta:
// A → FINALIZADO (ITSE posterior), B → FINALIZADO (ITSE previa), C → LICENCIA_PROVISIONAL.
// Lo usan las pruebas de recorridos (SC-003) y de privacidad (SC-008). Datos FICTICIOS.

export interface Peticion {
  readonly metodo: 'get' | 'post' | 'patch' | 'delete';
  readonly ruta: string;
  readonly token?: string;
  readonly cuerpo?: object;
  readonly ifMatch?: number;
  /** Campos de un formulario multipart con una foto JPG adjunta. */
  readonly campos?: Readonly<Record<string, string>>;
}

export interface Intercambio {
  readonly metodo: string;
  readonly url: string;
  readonly respuesta: Response;
}

export type Pedir = (peticion: Peticion) => Promise<Response>;

/** `Pedir` sobre la aplicación; si se da `intercambios`, guarda cada petición y su respuesta. */
export const pedirEn =
  (app: INestApplication<App>, intercambios?: Intercambio[]): Pedir =>
  async (peticion) => {
    const url = `/api/v1${peticion.ruta}`;
    let prueba = request(app.getHttpServer())
      [peticion.metodo](url)
      .set('X-Forwarded-For', '198.51.100.96');
    if (peticion.token !== undefined) {
      prueba = prueba.set('Authorization', `Bearer ${peticion.token}`);
    }
    if (peticion.ifMatch !== undefined) {
      prueba = prueba.set('If-Match', String(peticion.ifMatch));
    }
    let respuesta: Response;
    if (peticion.campos !== undefined) {
      for (const [campo, valor] of Object.entries(peticion.campos)) {
        prueba = prueba.field(campo, valor);
      }
      respuesta = await prueba.attach('fotos', JPG_PRUEBA, 'frente.jpg');
    } else {
      respuesta = await (peticion.cuerpo === undefined ? prueba : prueba.send(peticion.cuerpo));
    }
    intercambios?.push({ metodo: peticion.metodo, url, respuesta });
    return respuesta;
  };

export interface Personal {
  readonly evaluador: string;
  readonly caja: string;
  readonly jefatura: string;
  readonly inspector: { readonly id: string; readonly token: string };
}

export const hoyLima = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const esperar = (respuesta: Response, estado: number, paso: string): void => {
  if (respuesta.status !== estado) {
    throw new Error(`${paso}: se esperaba ${String(estado)} y llegó ${String(respuesta.status)}`);
  }
};

/** Lleva el expediente REGISTRADO hasta el final de su ruta usando solo la API y la cola de eventos. */
export const recorrerRuta = async (
  contexto: {
    readonly app: INestApplication<App>;
    readonly prisma: PrismaClient;
    readonly pedir: Pedir;
    readonly personal: Personal;
  },
  numero: string,
  ruta: 'A' | 'B' | 'C',
): Promise<void> => {
  const { app, prisma, pedir, personal } = contexto;
  const version = () => versionDe(prisma, numero);

  esperar(
    await pedir({
      metodo: 'post',
      ruta: `/expedientes/${numero}/evaluacion`,
      token: personal.evaluador,
      ifMatch: await version(),
    }),
    200,
    'iniciar evaluación',
  );
  esperar(
    await pedir({
      metodo: 'post',
      ruta: `/expedientes/${numero}/riesgo`,
      token: personal.evaluador,
      ifMatch: await version(),
    }),
    200,
    'confirmar riesgo',
  );
  await procesarTodo(app);

  if (ruta !== 'C') {
    esperar(
      await pedir({
        metodo: 'post',
        ruta: `/esquelas/ESQ-${numero}/pago`,
        token: personal.caja,
        cuerpo: { numeroRecibo: `REC-${numero.slice(-6)}` },
      }),
      201,
      'registrar pago',
    );
    await procesarTodo(app);
  }

  if (ruta !== 'B') {
    esperar(
      await pedir({
        metodo: 'post',
        ruta: `/expedientes/${numero}/aprobar`,
        token: personal.evaluador,
        ifMatch: await version(),
      }),
      200,
      'aprobar',
    );
    await procesarTodo(app);
  }

  if (ruta === 'C') {
    return;
  }

  const inspeccion = await prisma.inspeccion.findFirstOrThrow({
    where: { numero_expediente: numero },
  });
  esperar(
    await pedir({
      metodo: 'post',
      ruta: `/inspecciones/${inspeccion.id}/asignar`,
      token: personal.jefatura,
      cuerpo: { inspectorId: personal.inspector.id, programadaPara: hoyLima() },
    }),
    200,
    'asignar inspector',
  );
  esperar(
    await pedir({
      metodo: 'post',
      ruta: `/inspecciones/${inspeccion.id}/resultado`,
      token: personal.inspector.token,
      campos: {
        resultado: 'FAVORABLE',
        numeroCertificado: `ITSE-${ruta}-${numero.slice(-6)}`,
        certificadoEmitidoEn: hoyLima(),
      },
    }),
    201,
    'registrar resultado',
  );
  await procesarTodo(app);
};
