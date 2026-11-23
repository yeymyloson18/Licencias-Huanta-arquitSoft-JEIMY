import { Global, Module, type OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { DespachadorEventos } from '../../compartido/infraestructura/despachador-eventos';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { FachadaTramites } from '../tramites/fachada';
import { ConsultarLicencia, VerificarLicencia } from './aplicacion/consultar-licencia';
import { EmitirLicencia } from './aplicacion/emitir-licencia';
import { RegistrarCertificado } from './aplicacion/registrar-certificado';
import type { RepositorioLicencias } from './dominio/puertos';
import { FachadaLicencias } from './fachada';
import {
  ExpedientesFachadaTramites,
  GeneradorAleatorioCrypto,
  manejadorCertificadoRegistrado,
  manejadorLicenciaSolicitada,
  RelojSistema,
} from './infraestructura/adaptadores';
import { LimitadorVerificacionesRedis } from './infraestructura/limitador-verificaciones-redis';
import { PdfLicenciaPdfLib } from './infraestructura/pdf-licencia-pdflib';
import { RepositorioLicenciasPostgres } from './infraestructura/repositorio-licencias-postgres';
import { LicenciasController } from './presentacion/licencias.controller';

// Raíz de composición del módulo Licencias (006): emisión desde `LicenciaSolicitada`, certificado
// ITSE, PDF con QR y verificación pública. Usa Trámites solo por su fachada (es global).

const reloj = new RelojSistema();
const REPOSITORIO_LICENCIAS = Symbol('REPOSITORIO_LICENCIAS');

@Global()
@Module({
  controllers: [LicenciasController],
  exports: [FachadaLicencias],
  providers: [
    {
      provide: REPOSITORIO_LICENCIAS,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioLicenciasPostgres =>
        new RepositorioLicenciasPostgres(prisma),
    },
    {
      provide: FachadaLicencias,
      inject: [REPOSITORIO_LICENCIAS],
      useFactory: (licencias: RepositorioLicenciasPostgres) =>
        new FachadaLicencias(licencias, undefined, licencias),
    },
    {
      provide: EmitirLicencia,
      inject: [REPOSITORIO_LICENCIAS, FachadaTramites],
      useFactory: (licencias: RepositorioLicencias, tramites: FachadaTramites) =>
        new EmitirLicencia({
          licencias,
          expedientes: new ExpedientesFachadaTramites(tramites),
          aleatorio: new GeneradorAleatorioCrypto(),
          reloj,
        }),
    },
    {
      provide: RegistrarCertificado,
      inject: [REPOSITORIO_LICENCIAS],
      useFactory: (licencias: RepositorioLicencias) => new RegistrarCertificado(licencias),
    },
    {
      provide: ConsultarLicencia,
      inject: [REPOSITORIO_LICENCIAS, CONFIGURACION],
      useFactory: (licencias: RepositorioLicencias, configuracion: Configuracion) =>
        new ConsultarLicencia({
          licencias,
          pdf: new PdfLicenciaPdfLib(),
          reloj,
          urlPublicaPortal: configuracion.urlPublicaPortal,
        }),
    },
    {
      provide: VerificarLicencia,
      inject: [REPOSITORIO_LICENCIAS, REDIS_CLIENTE],
      useFactory: (licencias: RepositorioLicencias, redis: Redis) =>
        new VerificarLicencia({
          licencias,
          limitador: new LimitadorVerificacionesRedis(redis),
          reloj,
        }),
    },
  ],
})
export class LicenciasModule implements OnModuleInit {
  constructor(
    private readonly despachador: DespachadorEventos,
    private readonly emitirLicencia: EmitirLicencia,
    private readonly registrarCertificado: RegistrarCertificado,
  ) {}

  onModuleInit(): void {
    this.despachador.registrar(
      'LicenciaSolicitada',
      manejadorLicenciaSolicitada(this.emitirLicencia),
    );
    this.despachador.registrar(
      'CertificadoItseRegistrado',
      manejadorCertificadoRegistrado(this.registrarCertificado),
    );
  }
}
