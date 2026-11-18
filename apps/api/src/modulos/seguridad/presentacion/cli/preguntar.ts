import { createInterface } from 'node:readline';

/** Pregunta un texto en la terminal. */
const preguntarVisible = (pregunta: string): Promise<string> =>
  new Promise((resolver) => {
    const lector = createInterface({ input: process.stdin, output: process.stdout });
    lector.question(pregunta, (respuesta) => {
      lector.close();
      resolver(respuesta.trim());
    });
  });

/** Pregunta un texto sin mostrarlo en pantalla (para la clave). */
const preguntarOculto = (pregunta: string): Promise<string> =>
  new Promise((resolver, rechazar) => {
    const entrada = process.stdin;
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let texto = '';

    const terminar = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener('data', alEscribir);
      process.stdout.write('\n');
    };

    const alEscribir = (fragmento: string) => {
      for (const caracter of fragmento) {
        if (caracter === '\r' || caracter === '\n') {
          terminar();
          resolver(texto);
          return;
        }
        if (caracter === '\u0003') {
          // Ctrl+C
          terminar();
          rechazar(new Error('Cancelado'));
          return;
        }
        if (caracter === '\u007f' || caracter === '\b') {
          texto = texto.slice(0, -1);
        } else {
          texto += caracter;
        }
      }
    };

    entrada.on('data', alEscribir);
  });

/** Lectura interactiva de un dato; la clave se pide sin eco. */
export const preguntarEnTerminal = (pregunta: string, oculto: boolean): Promise<string> =>
  oculto ? preguntarOculto(pregunta) : preguntarVisible(pregunta);
