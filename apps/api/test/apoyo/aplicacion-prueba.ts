import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configurarAplicacion } from '../../src/configurar-aplicacion';

/**
 * Logger que acumula las líneas en memoria en vez de imprimirlas. Las pruebas de datos personales
 * (SC-007) revisan que ninguna línea contenga correo, celular, clave ni código.
 */
export class LoggerCapturador implements LoggerService {
  readonly lineas: string[] = [];

  log(mensaje: unknown, ...contexto: unknown[]): void {
    this.guardar('log', mensaje, contexto);
  }
  error(mensaje: unknown, ...contexto: unknown[]): void {
    this.guardar('error', mensaje, contexto);
  }
  warn(mensaje: unknown, ...contexto: unknown[]): void {
    this.guardar('warn', mensaje, contexto);
  }
  debug(mensaje: unknown, ...contexto: unknown[]): void {
    this.guardar('debug', mensaje, contexto);
  }
  verbose(mensaje: unknown, ...contexto: unknown[]): void {
    this.guardar('verbose', mensaje, contexto);
  }

  private guardar(nivel: string, mensaje: unknown, contexto: readonly unknown[]): void {
    this.lineas.push([nivel, mensaje, ...contexto].map((parte) => String(parte)).join(' '));
  }
}

export interface AplicacionDePrueba {
  readonly app: INestApplication;
  readonly logger: LoggerCapturador;
}

/**
 * Crea la aplicación completa (mismo AppModule y misma configuración que `main.ts`) con el logger
 * capturador. `ajustar` permite reemplazar proveedores (por ejemplo, el reloj) antes de compilar.
 */
export const crearAplicacionDePrueba = async (
  ajustar: (constructor: TestingModuleBuilder) => TestingModuleBuilder = (c) => c,
): Promise<AplicacionDePrueba> => {
  const modulo = await ajustar(Test.createTestingModule({ imports: [AppModule] })).compile();
  const logger = new LoggerCapturador();
  const app = modulo.createNestApplication({ logger });
  configurarAplicacion(app);
  await app.init();
  return { app, logger };
};
