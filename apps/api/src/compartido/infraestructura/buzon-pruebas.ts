import { createTransport, type Transporter } from 'nodemailer';

/** Mensaje para el buzón de pruebas: el asunto ya viene con el destino enmascarado. */
export interface MensajeBuzon {
  readonly asunto: string;
  readonly texto: string;
}

/** Remitente y destinatario fijos: el destino real nunca va en una cabecera SMTP (research §R-07). */
const DE = 'Licencias Huanta (pruebas) <buzon@licencias.local>';
const PARA = 'pruebas@licencias.local';
const TIEMPO_MAXIMO_MS = 5_000;

/**
 * Entrega mensajes al buzón de pruebas de desarrollo (Mailpit) por SMTP con `nodemailer` (009). La
 * configuración impide usarlo en producción. Si el servidor no responde, `enviar` lanza.
 */
export class BuzonPruebas {
  private readonly transporte: Transporter;

  constructor(url: string) {
    const servidor = new URL(url);
    // Mailpit en desarrollo: sin TLS ni usuario (solo red local de Docker Compose).
    this.transporte = createTransport({
      host: servidor.hostname,
      port: Number(servidor.port || '25'),
      secure: false,
      ignoreTLS: true,
      connectionTimeout: TIEMPO_MAXIMO_MS,
      greetingTimeout: TIEMPO_MAXIMO_MS,
      socketTimeout: TIEMPO_MAXIMO_MS,
    });
  }

  async enviar(mensaje: MensajeBuzon): Promise<void> {
    await this.transporte.sendMail({
      from: DE,
      to: PARA,
      subject: mensaje.asunto,
      text: mensaje.texto,
    });
  }
}
