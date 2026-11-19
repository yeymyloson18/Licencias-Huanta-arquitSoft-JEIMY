import { Module } from '@nestjs/common';

// Raíz de composición del módulo Trámites (funcionalidad 004). Los casos de uso se cablean aquí con
// `useFactory` a medida que se implementan las historias; usa el catálogo y la seguridad solo por
// sus fachadas (principio I).
@Module({})
export class TramitesModule {}
