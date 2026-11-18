import type { INestApplication, LoggerService, Type } from '@nestjs/common';
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

export interface OpcionesAplicacionDePrueba {
  /** Permite reemplazar proveedores (por ejemplo, el reloj) antes de compilar. */
  readonly ajustar?: (constructor: TestingModuleBuilder) => TestingModuleBuilder;
  /** Controladores solo de prueba (por ejemplo, operaciones protegidas de ejemplo). */
  readonly controladores?: readonly Type[];
}

/**
 * Crea la aplicación completa (mismo AppModule y misma configuración que `main.ts`) con el logger
 * capturador.
 */
export const crearAplicacionDePrueba = async (
  opciones: OpcionesAplicacionDePrueba = {},
): Promise<AplicacionDePrueba> => {
  const ajustar = opciones.ajustar ?? ((constructor) => constructor);
  const modulo = await ajustar(
    Test.createTestingModule({
      imports: [AppModule],
      controllers: [...(opciones.controladores ?? [])],
    }),
  ).compile();
  const logger = new LoggerCapturador();
  const app = modulo.createNestApplication({ logger });
  configurarAplicacion(app);
  await app.init();
  return { app, logger };
};
