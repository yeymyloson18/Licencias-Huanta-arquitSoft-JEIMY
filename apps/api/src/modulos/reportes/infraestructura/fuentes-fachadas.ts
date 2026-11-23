import type Redis from 'ioredis';
import type { FachadaCatalogo } from '../../catalogo/fachada';
import type { FachadaLicencias, LicenciaParaReporte } from '../../licencias/fachada';
import type { FachadaPagos } from '../../pagos/fachada';
import type { FachadaPlazos } from '../../plazos/fachada';
import type { FachadaTramites } from '../../tramites/fachada';
import type {
  CacheReportes,
  FilaReporte,
  FuenteCatalogo,
  FuenteFeriados,
  FuenteLicencias,
  FuentePagos,
  FuenteTramites,
} from '../dominio/puertos';

// Adaptadores de los puertos de Reportes sobre las fachadas de los otros módulos (FR-013 de la 007).

export class FuenteTramitesFachada implements FuenteTramites {
  constructor(private readonly tramites: FachadaTramites) {}

  conteoPorEstado(desde: string, hasta: string) {
    return this.tramites.conteoPorEstado(desde, hasta);
  }

  atencionesTerminadas(desde: string, hasta: string) {
    return this.tramites.atencionesTerminadas(desde, hasta);
  }

  async expedientesEnTramite(codigoReceta?: string): Promise<FilaReporte[]> {
    return (await this.tramites.expedientesEnTramite(codigoReceta)).map((fila) => ({
      numero: fila.numero,
      codigoReceta: fila.codigoReceta,
      titular: fila.titularPublico,
      giro: fila.giro,
      zona: fila.zona,
      estado: fila.estado,
      fecha: fila.presentadoEn,
    }));
  }
}

export class FuentePagosFachada implements FuentePagos {
  constructor(private readonly pagos: FachadaPagos) {}

  pagosRegistrados(desde: string, hasta: string) {
    return this.pagos.pagosRegistrados(desde, hasta);
  }
}

const aFila = (licencia: LicenciaParaReporte): FilaReporte => ({
  numero: licencia.numero,
  codigoReceta: licencia.codigoReceta,
  titular: licencia.titularPublico,
  giro: licencia.giro,
  zona: licencia.zona,
  estado: licencia.estado,
  fecha: licencia.fecha,
});

export class FuenteLicenciasFachada implements FuenteLicencias {
  constructor(private readonly licencias: FachadaLicencias) {}

  async vigentes(codigoReceta?: string): Promise<FilaReporte[]> {
    return (await this.licencias.licenciasVigentes(codigoReceta)).map(aFila);
  }

  async itsePorVencer(codigoReceta?: string): Promise<FilaReporte[]> {
    return (await this.licencias.itsePorVencer(codigoReceta)).map(aFila);
  }
}

export class FuenteCatalogoFachada implements FuenteCatalogo {
  constructor(private readonly catalogo: FachadaCatalogo) {}

  async plazosPorReceta() {
    return (await this.catalogo.listarRecetas({ tipo: 'LICENCIA' })).map((receta) => ({
      codigoReceta: receta.codigo,
      plazoDias: receta.plazoDias,
    }));
  }
}

export class FuenteFeriadosFachada implements FuenteFeriados {
  constructor(private readonly plazos: FachadaPlazos) {}

  feriadosEntre(desde: string, hasta: string) {
    return this.plazos.feriadosEntre(desde, hasta);
  }
}

/** Caché `rep:*` en Redis (research §R-04 de la 007). */
export class CacheReportesRedis implements CacheReportes {
  constructor(private readonly redis: Redis) {}

  leer(clave: string): Promise<string | null> {
    return this.redis.get(clave);
  }

  async guardar(clave: string, valor: string, segundos: number): Promise<void> {
    await this.redis.set(clave, valor, 'EX', segundos);
  }
}
