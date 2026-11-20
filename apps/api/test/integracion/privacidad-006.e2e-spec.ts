import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { EnviarAvisosPendientes } from '../../src/modulos/notificaciones/aplicacion/avisos';
import { RelojPlazos } from '../../src/modulos/plazos/infraestructura/reloj-plazos';
import { clienteConRoles } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { limpiarPagos } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiar006 } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import {
  hoyLima,
  type Intercambio,
  pedirEn,
  type Personal,
  recorrerRuta,
} from '../apoyo/recorrido-006';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { textoDePdf } from '../apoyo/texto-pdf';

// SC-008 de la 006 (principio VII): recorre las tres rutas, la inspección, la licencia, los plazos y
// los avisos, con errores de por medio, y comprueba que el documento, el RUC, el celular, el correo y
// la dirección del titular no aparecen en registros, URL, errores, eventos, avisos, auditorías,
// verificación pública ni PDF. La dirección solo la ven el inspector asignado y el detalle del
// personal. Datos FICTICIOS.

const PERSONALES = [
  TITULAR_DE_PRUEBA.documento,
  TITULAR_DE_PRUEBA.ruc,
  TITULAR_DE_PRUEBA.celular,
  TITULAR_DE_PRUEBA.correo,
  TITULAR_DE_PRUEBA.direccion,
];

const filtrados = (texto: string, valores: readonly string[] = PERSONALES) =>
  valores.filter((valor) => texto.includes(valor));

const comoTexto = (valor: unknown) =>
  JSON.stringify(valor, (_, dato: unknown) => (typeof dato === 'bigint' ? String(dato) : dato));

describe('Privacidad en ITSE, licencia, plazos y avisos (SC-008 de la 006)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let redis: Redis;
  let prisma: PrismaServicio;
  let pdf: Buffer = Buffer.alloc(0);
  let verificacion: Intercambio | undefined;
  const intercambios: Intercambio[] = [];

  beforeAll(async () => {
    const creada = await crearAplicacionDePrueba();
    app = creada.app as INestApplication<App>;
    logger = creada.logger;
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    const protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    for (const clave of await redis.keys('lim:*')) {
      await redis.del(clave);
    }
    for (const clave of await redis.keys('dev:aviso:*')) {
      await redis.del(clave);
    }
    const inspector = await clienteConRoles(app, prisma, redis, ['INSPECTOR']);
    const admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
    const personal: Personal = {
      evaluador: (await clienteConRoles(app, prisma, redis, ['EVALUADOR'])).token,
      caja: (await clienteConRoles(app, prisma, redis, ['CAJA'])).token,
      jefatura: (await clienteConRoles(app, prisma, redis, ['JEFATURA'])).token,
      inspector: { id: inspector.usuario.id, token: inspector.token },
    };
    const pedir = pedirEn(app, intercambios);
    const contexto = { app, prisma, pedir, personal };

    // Las tres rutas completas.
    const rutaA = (await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-02' })).numero;
    const rutaB = (await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-03' })).numero;
    const rutaC = (await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-09' })).numero;
    await recorrerRuta(contexto, rutaA, 'A');
    await recorrerRuta(contexto, rutaB, 'B');
    await recorrerRuta(contexto, rutaC, 'C');

    // Inspecciones: listas, asignación inválida y resultado repetido.
    const bodega = await prisma.inspeccion.findFirstOrThrow({
      where: { numero_expediente: rutaC },
    });
    await pedir({ metodo: 'get', ruta: '/inspecciones', token: personal.jefatura });
    await pedir({ metodo: 'get', ruta: '/inspecciones/inspectores', token: personal.jefatura });
    await pedir({
      metodo: 'post',
      ruta: `/inspecciones/${bodega.id}/asignar`,
      token: personal.jefatura,
      cuerpo: { inspectorId: '00000000-0000-4000-8000-0000000000aa', programadaPara: '2020-01-01' },
    });
    await pedir({
      metodo: 'post',
      ruta: `/inspecciones/${bodega.id}/asignar`,
      token: personal.jefatura,
      cuerpo: { inspectorId: personal.inspector.id, programadaPara: hoyLima() },
    });
    await pedir({ metodo: 'get', ruta: '/inspecciones', token: personal.inspector.token });
    const realizada = await prisma.inspeccion.findFirstOrThrow({
      where: { numero_expediente: rutaB },
    });
    await pedir({
      metodo: 'post',
      ruta: `/inspecciones/${realizada.id}/resultado`,
      token: personal.inspector.token,
      campos: { resultado: 'DESFAVORABLE', observaciones: 'Segundo registro que no corresponde' },
    });

    // Licencia: consulta pública con token, detalle, verificación (válida e inválida) y PDF.
    const consulta = await pedir({
      metodo: 'post',
      ruta: '/expedientes/consultar',
      cuerpo: { numeroExpediente: rutaB, documento: TITULAR_DE_PRUEBA.documento },
    });
    const token = (consulta.body as { tokenConsulta?: { token: string } }).tokenConsulta?.token;
    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: rutaB },
    });
    await pedir({ metodo: 'get', ruta: `/licencias/${licencia.numero}`, token });
    await pedir({ metodo: 'get', ruta: `/licencias/${licencia.numero}`, token: personal.caja });
    await pedir({ metodo: 'get', ruta: '/licencias/verificar/codigo-que-no-existe-000' });
    await pedir({ metodo: 'get', ruta: `/licencias/verificar/${licencia.codigo_verificacion}` });
    verificacion = intercambios.at(-1);
    const descarga = await request(app.getHttpServer())
      .get(`/api/v1/licencias/${licencia.numero}/pdf`)
      .set('Authorization', `Bearer ${token ?? ''}`)
      .buffer(true)
      .parse((respuesta, listo) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => {
          listo(null, Buffer.concat(partes));
        });
      });
    pdf = descarga.body as Buffer;

    // Plazos: feriados (con errores), reloj, alertas y avisos.
    await pedir({ metodo: 'get', ruta: '/feriados?anio=2026', token: admin.token });
    await pedir({
      metodo: 'post',
      ruta: '/feriados',
      token: admin.token,
      cuerpo: { fecha: 'no-es-fecha', descripcion: 'x' },
    });
    const conPlazo = (await sembrarExpediente(prisma, protector)).numero;
    await prisma.expediente.update({
      where: { numero: conPlazo },
      data: { vence_plazo_en: new Date(`${hoyLima()}T00:00:00Z`) },
    });
    await app.get(RelojPlazos).ejecutarPasada();
    const alertas = await pedir({
      metodo: 'get',
      ruta: '/plazos/alertas',
      token: personal.jefatura,
    });
    const alertaId = (alertas.body as { id: number }[])[0]?.id ?? 0;
    await pedir({
      metodo: 'post',
      ruta: `/plazos/alertas/${String(alertaId)}/atender`,
      token: personal.jefatura,
    });
    await pedir({
      metodo: 'post',
      ruta: '/plazos/alertas/999999/atender',
      token: personal.jefatura,
    });
    await app.get(EnviarAvisosPendientes).ejecutar();
  });

  afterAll(async () => {
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('el recorrido llegó al final de las tres rutas y pasó por errores', async () => {
    const estados = intercambios.map((i) => i.respuesta.status);

    expect(estados).toEqual(expect.arrayContaining([200, 201, 403, 404, 409, 422]));
    expect(
      (await prisma.expediente.findMany({ select: { estado: true } })).map((e) => e.estado).sort(),
    ).toEqual(['FINALIZADO', 'FINALIZADO', 'LICENCIA_PROVISIONAL', 'REGISTRADO']);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('ningún registro del servidor ni URL trae datos personales', () => {
    expect(filtrados(logger.lineas.join('\n'))).toEqual([]);
    expect(filtrados(intercambios.map((i) => i.url).join('\n'))).toEqual([]);
  });

  it('ninguna respuesta (de éxito o de error) trae documento, RUC, celular ni correo', () => {
    const cuerpos = intercambios
      .map((i) => `${comoTexto(i.respuesta.headers)}\n${comoTexto(i.respuesta.body)}`)
      .join('\n');

    expect(filtrados(cuerpos, PERSONALES.slice(0, 4))).toEqual([]);
  });

  it('la dirección solo sale al inspector asignado y en las decisiones del personal', () => {
    const conDireccion = intercambios.filter((i) =>
      comoTexto(i.respuesta.body).includes(TITULAR_DE_PRUEBA.direccion),
    );

    expect(conDireccion.length).toBeGreaterThan(0);
    for (const intercambio of conDireccion) {
      expect(intercambio.respuesta.status).toBe(200);
      expect(intercambio.url).toMatch(
        /^\/api\/v1\/(inspecciones|expedientes\/EXP-\d{4}-\d{6}(\/(evaluacion|riesgo|aprobar))?)$/,
      );
    }
    const listaJefatura = intercambios.find(
      (i) => i.url === '/api/v1/inspecciones' && i.respuesta.status === 200,
    );
    expect(comoTexto(listaJefatura?.respuesta.body)).not.toContain(TITULAR_DE_PRUEBA.direccion);
  });

  it('la verificación pública y el PDF muestran el nombre abreviado y ningún dato personal', () => {
    const publico = comoTexto(verificacion?.respuesta.body);
    const texto = textoDePdf(pdf);

    expect(verificacion?.respuesta.status).toBe(200);
    expect(filtrados(publico, [...PERSONALES, TITULAR_DE_PRUEBA.nombre])).toEqual([]);
    expect(filtrados(texto, [...PERSONALES, TITULAR_DE_PRUEBA.nombre])).toEqual([]);
  });

  it('eventos, avisos, auditorías, alertas e historial no guardan datos personales', async () => {
    const guardado = comoTexto([
      await prisma.evento_pendiente.findMany(),
      await prisma.mensaje.findMany({
        select: { datos: true, plantilla: true, ultimo_error: true },
      }),
      await prisma.auditoriaTramites.findMany(),
      await prisma.auditoriaPagos.findMany(),
      await prisma.auditoriaLicencias.findMany(),
      await prisma.auditoriaInspecciones.findMany(),
      await prisma.alerta.findMany(),
      await prisma.historial_estado.findMany(),
      await prisma.licencia.findMany(),
      await prisma.inspeccion.findMany(),
    ]);
    const simulados = await Promise.all(
      (await redis.keys('dev:aviso:*')).map((clave) => redis.get(clave)),
    );

    expect(simulados.length).toBeGreaterThan(0);
    expect(filtrados(guardado)).toEqual([]);
    expect(filtrados(simulados.join('\n'))).toEqual([]);
  });

  it('el destinatario del aviso solo se guarda cifrado', async () => {
    const destinos = (await prisma.mensaje.findMany({ select: { destino_cifrado: true } })).map(
      (m) => Buffer.from(m.destino_cifrado).toString('latin1'),
    );

    expect(destinos.length).toBeGreaterThan(0);
    expect(filtrados(destinos.join('\n'))).toEqual([]);
  });
});
