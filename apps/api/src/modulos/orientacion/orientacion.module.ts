import { Module } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { FachadaCatalogo } from '../catalogo/fachada';
import type { FuenteCatalogo, FuenteGuia, ProveedorOrientacion, Reloj } from './dominio/puertos';
import { FuenteCatalogoFachada } from './infraestructura/fuente-catalogo-fachada';
import { GuiaOrientacionArchivo } from './infraestructura/guia-orientacion-archivo';
import { ProveedorIaCompatibleOpenAI } from './infraestructura/proveedor-ia-compatible-openai';
import {
  FUENTE_CATALOGO_ORIENTACION,
  FUENTE_GUIA_ORIENTACION,
  PROVEEDOR_ORIENTACION,
  RELOJ_ORIENTACION,
} from './tokens';

// Raíz de composición del módulo Orientación (012, enmienda 1.1.0 de la constitución). Lee el
// catálogo solo por FachadaCatalogo (con su caché) y llama al proveedor externo de IA desde el
// backend (ADR-011). El controlador, el caso de uso y el límite por persona se agregan con las
// historias de usuario (tasks.md, fases 3 a 7).

@Module({
  providers: [
    {
      provide: FUENTE_CATALOGO_ORIENTACION,
      inject: [FachadaCatalogo],
      useFactory: (catalogo: FachadaCatalogo): FuenteCatalogo =>
        new FuenteCatalogoFachada(catalogo),
    },
    {
      // Se construye al arrancar: si la guía es inválida, la API no arranca (research R-03).
      provide: FUENTE_GUIA_ORIENTACION,
      useFactory: (): FuenteGuia => new GuiaOrientacionArchivo(),
    },
    {
      provide: PROVEEDOR_ORIENTACION,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): ProveedorOrientacion =>
        new ProveedorIaCompatibleOpenAI(configuracion.orientacion),
    },
    {
      provide: RELOJ_ORIENTACION,
      useValue: { ahora: () => Date.now() } satisfies Reloj,
    },
  ],
})
export class OrientacionModule {}
