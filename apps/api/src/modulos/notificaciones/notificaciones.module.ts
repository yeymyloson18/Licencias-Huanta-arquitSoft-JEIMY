import { BuzonPruebas } from '../../compartido/infraestructura/buzon-pruebas';
import { EnviadorBuzon } from './infraestructura/enviador-buzon';
import { Module, type OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ProtectorDatos } from '../../compartido/dominio/protector-datos';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { DespachadorEventos } from '../../compartido/infraestructura/despachador-eventos';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { FachadaTramites } from '../tramites/fachada';
import { CrearAviso, EnviarAvisosPendientes } from './aplicacion/avisos';
import type { RepositorioAvisos } from './dominio/puertos';
import {
  EnviadorSimuladoRedis,
  ExpedientesFachadaTramites,
  manejadorCambioEstado,
  manejadorItsePorVencer,
  TareaEnvioAvisos,
} from './infraestructura/adaptadores';
import { RepositorioAvisosPostgres } from './infraestructura/repositorio-avisos-postgres';

// Raíz de composición del módulo Notificaciones (006): avisos desde los eventos
// `EstadoExpedienteCambiado` e `ItsePorVencer` y su envío (simulado mientras no haya servicio).

const reloj = { ahora: () => new Date() };
const REPOSITORIO_AVISOS = Symbol('REPOSITORIO_AVISOS');

@Module({
  providers: [
    {
      provide: REPOSITORIO_AVISOS,
      inject: [PrismaServicio, PROTECTOR_DATOS],
      useFactory: (prisma: PrismaServicio, protector: ProtectorDatos): RepositorioAvisos =>
        new RepositorioAvisosPostgres(prisma, protector),
    },
    {
      provide: CrearAviso,
      inject: [REPOSITORIO_AVISOS, FachadaTramites],
      useFactory: (avisos: RepositorioAvisos, tramites: FachadaTramites) =>
        new CrearAviso({ avisos, expedientes: new ExpedientesFachadaTramites(tramites), reloj }),
    },
    {
      provide: EnviarAvisosPendientes,
      inject: [REPOSITORIO_AVISOS, REDIS_CLIENTE, CONFIGURACION],
      useFactory: (avisos: RepositorioAvisos, redis: Redis, configuracion: Configuracion) => {
        // Simulado (Redis) o buzón de pruebas (Redis + Mailpit, 009; prohibido en producción).
        const simulado = new EnviadorSimuladoRedis(redis);
        const enviador =
          configuracion.envioAvisos === 'buzon'
            ? new EnviadorBuzon(simulado, new BuzonPruebas(configuracion.smtpBuzonUrl))
            : simulado;
        return new EnviarAvisosPendientes({ avisos, enviador, reloj });
      },
    },
    {
      provide: TareaEnvioAvisos,
      inject: [EnviarAvisosPendientes, CONFIGURACION],
      useFactory: (enviar: EnviarAvisosPendientes, configuracion: Configuracion) =>
        new TareaEnvioAvisos(enviar, configuracion.avisosIntervaloMs),
    },
  ],
})
export class NotificacionesModule implements OnModuleInit {
  constructor(
    private readonly despachador: DespachadorEventos,
    private readonly crearAviso: CrearAviso,
  ) {}

  onModuleInit(): void {
    this.despachador.registrar('EstadoExpedienteCambiado', manejadorCambioEstado(this.crearAviso));
    this.despachador.registrar('ItsePorVencer', manejadorItsePorVencer(this.crearAviso));
  }
}
