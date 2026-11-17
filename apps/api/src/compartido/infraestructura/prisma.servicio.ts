import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Cliente Prisma compartido. Si PostgreSQL no responde al arrancar, la API sigue en pie:
// Prisma reconecta en la siguiente consulta y el chequeo de salud informa CAIDO hasta entonces
// (research.md §R-06, caso límite "la base tarda en arrancar más que el backend").
@Injectable()
export class PrismaServicio extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly registro = new Logger(PrismaServicio.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      // No se registra el error original: puede incluir la cadena de conexión.
      this.registro.warn(
        'PostgreSQL no disponible al arrancar; se reintentará en la siguiente consulta',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
