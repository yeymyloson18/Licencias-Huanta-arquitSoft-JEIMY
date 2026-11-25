import type { TestingModuleBuilder } from '@nestjs/testing';
import type {
  MensajeProveedor,
  ProveedorOrientacion,
  ResultadoProveedor,
} from '../../src/modulos/orientacion/dominio/puertos';
import { PROVEEDOR_ORIENTACION } from '../../src/modulos/orientacion/tokens';

// Proveedor de IA SIMULADO para las pruebas de la 012 (research R-12): guarda lo que recibe y devuelve
// lo que se le programe. Las pruebas nunca llaman al proveedor real ni usan su clave.

export class ProveedorOrientacionSimulado implements ProveedorOrientacion {
  /** Cada llamada, con los mensajes tal como salieron hacia el "proveedor". */
  readonly llamadas: (readonly MensajeProveedor[])[] = [];
  private siguiente: ResultadoProveedor | (() => Promise<ResultadoProveedor>) = {
    tipo: 'OK',
    contenido: JSON.stringify({ tipo: 'SIN_INFORMACION', texto: 'Sin programar' }),
  };

  /** Respuesta OK con el objeto JSON que devolvería el modelo. */
  responderCon(respuestaModelo: Readonly<Record<string, unknown>>): this {
    this.siguiente = { tipo: 'OK', contenido: JSON.stringify(respuestaModelo) };
    return this;
  }

  /** Respuesta OK con un contenido literal (por ejemplo, texto que no es JSON). */
  responderTexto(contenido: string): this {
    this.siguiente = { tipo: 'OK', contenido };
    return this;
  }

  /** Cualquier resultado, incluidas las fallas (TIEMPO_AGOTADO, CUOTA_AGOTADA…). */
  responderResultado(resultado: ResultadoProveedor): this {
    this.siguiente = resultado;
    return this;
  }

  /** Una excepción inesperada del adaptador. */
  fallarConExcepcion(error = new Error('Falla inesperada del proveedor simulado')): this {
    this.siguiente = () => Promise.reject(error);
    return this;
  }

  /** Todo el texto que recibió el proveedor (para buscar datos personales). */
  textoRecibido(): string {
    return this.llamadas.flatMap((mensajes) => mensajes.map((m) => m.contenido)).join('\n');
  }

  reiniciar(): void {
    this.llamadas.length = 0;
  }

  responder(mensajes: readonly MensajeProveedor[]): Promise<ResultadoProveedor> {
    this.llamadas.push(mensajes.map((mensaje) => ({ ...mensaje })));
    const siguiente = this.siguiente;
    return typeof siguiente === 'function' ? siguiente() : Promise.resolve(siguiente);
  }
}

/**
 * Para `crearAplicacionDePrueba({ ajustar })`: reemplaza el proveedor real por el simulado.
 * Se puede combinar con otro ajuste.
 */
export const conProveedorSimulado =
  (
    simulado: ProveedorOrientacion,
    otro: (constructor: TestingModuleBuilder) => TestingModuleBuilder = (constructor) =>
      constructor,
  ) =>
  (constructor: TestingModuleBuilder): TestingModuleBuilder =>
    otro(constructor).overrideProvider(PROVEEDOR_ORIENTACION).useValue(simulado);
