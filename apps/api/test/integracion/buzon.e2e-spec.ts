import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import Redis from 'ioredis';
import { BuzonPruebas } from '../../src/compartido/infraestructura/buzon-pruebas';
import { Celular } from '../../src/modulos/seguridad/dominio/celular';
import { ErrorEnvioOtp } from '../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import { EnviadorOtpBuzon } from '../../src/modulos/seguridad/infraestructura/enviador-otp-buzon';
import { EnviadorOtpSimulado } from '../../src/modulos/seguridad/infraestructura/enviador-otp-simulado';

// Buzón de pruebas (HU4 de la 009): el adaptador deja el código en Redis como el simulado (para que
// pruebas, E2E, Postman y carga lo sigan leyendo) y lo entrega por SMTP con el celular enmascarado.
// En vez de Mailpit, un servidor SMTP mínimo en el proceso recibe los mensajes. Datos FICTICIOS.

/** Servidor SMTP de prueba: acepta todo y guarda cada mensaje recibido (sin TLS ni usuario). */
const servidorSmtp = () => {
  const mensajes: string[] = [];
  const servidor: Server = createServer((socket: Socket) => {
    let enDatos = false;
    let datos = '';
    let resto = '';
    const responder = (linea: string) => socket.write(`${linea}\r\n`);
    responder('220 prueba ESMTP');
    socket.on('data', (trozo: Buffer) => {
      resto += trozo.toString('utf8');
      if (enDatos) {
        const fin = resto.indexOf('\r\n.\r\n');
        if (fin === -1) {
          return;
        }
        datos = resto.slice(0, fin);
        resto = resto.slice(fin + 5);
        enDatos = false;
        mensajes.push(datos);
        responder('250 recibido');
      }
      let salto = resto.indexOf('\r\n');
      while (!enDatos && salto !== -1) {
        const comando = resto.slice(0, salto).toUpperCase();
        resto = resto.slice(salto + 2);
        if (comando.startsWith('EHLO') || comando.startsWith('HELO')) {
          responder('250 prueba');
        } else if (comando.startsWith('DATA')) {
          enDatos = true;
          responder('354 siga');
        } else if (comando.startsWith('QUIT')) {
          responder('221 adiós');
          socket.end();
        } else {
          responder('250 bien');
        }
        salto = resto.indexOf('\r\n');
      }
    });
  });
  return { servidor, mensajes };
};

/** Decodifica un encabezado MIME con palabras `=?UTF-8?B?…?=` o `=?UTF-8?Q?…?=`. */
const decodificarEncabezado = (valor: string): string =>
  valor
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_, tipo: string, texto: string) =>
      tipo.toUpperCase() === 'B'
        ? Buffer.from(texto, 'base64').toString('utf8')
        : Buffer.from(
            texto
              .replace(/_/g, ' ')
              .replace(/=([0-9A-F]{2})/gi, (__, hex: string) =>
                String.fromCharCode(parseInt(hex, 16)),
              ),
            'latin1',
          ).toString('utf8'),
    );

const asuntoDe = (mensaje: string): string => {
  const linea = /^Subject: (.*(?:\r\n[ \t].*)*)/m.exec(mensaje)?.[1] ?? '';
  return decodificarEncabezado(linea.replace(/\r\n[ \t]/g, ' '));
};

describe('Buzón de pruebas (009)', () => {
  let redis: Redis;
  let smtp: ReturnType<typeof servidorSmtp>;
  let puerto = 0;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    smtp = servidorSmtp();
    await new Promise<void>((listo) => smtp.servidor.listen(0, '127.0.0.1', listo));
    puerto = (smtp.servidor.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((listo) => smtp.servidor.close(() => listo()));
    await redis.quit();
  });

  it('entrega el código con el celular enmascarado y lo deja en Redis como el simulado', async () => {
    const usuarioId = randomUUID();
    const enviador = new EnviadorOtpBuzon(
      new EnviadorOtpSimulado(redis),
      new BuzonPruebas(`smtp://127.0.0.1:${String(puerto)}`),
    );

    await enviador.enviar(Celular.crear('987650001'), '482915', usuarioId);

    expect(await redis.get(`dev:otp:${usuarioId}`)).toBe('482915');
    expect(await redis.ttl(`dev:otp:${usuarioId}`)).toBeGreaterThan(0);
    const mensaje = smtp.mensajes.at(-1) ?? '';
    expect(asuntoDe(mensaje)).toBe('Código de verificación para 9*****001');
    expect(mensaje).toContain('482915');
    expect(mensaje).not.toContain('987650001');
    expect(mensaje).toContain('pruebas@licencias.local');
    await redis.del(`dev:otp:${usuarioId}`);
  });

  it('si el servidor SMTP no responde, lanza ErrorEnvioOtp', async () => {
    // Un puerto que se abre y se cierra enseguida: nadie escucha ahí.
    const libre = createServer();
    await new Promise<void>((listo) => libre.listen(0, '127.0.0.1', listo));
    const cerrado = (libre.address() as AddressInfo).port;
    await new Promise<void>((listo) => libre.close(() => listo()));
    const usuarioId = randomUUID();
    const enviador = new EnviadorOtpBuzon(
      new EnviadorOtpSimulado(redis),
      new BuzonPruebas(`smtp://127.0.0.1:${String(cerrado)}`),
    );

    await expect(
      enviador.enviar(Celular.crear('987650002'), '111222', usuarioId),
    ).rejects.toBeInstanceOf(ErrorEnvioOtp);
    await redis.del(`dev:otp:${usuarioId}`);
  });
});
