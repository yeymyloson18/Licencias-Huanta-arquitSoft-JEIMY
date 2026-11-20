import type {
  DatosIdentificacion,
  PersonaAIdentificar,
  ResultadoIdentificacion,
  ServicioIdentificacion,
} from '../dominio/puertos/servicio-identificacion';

// Servicio de identificación SIMULADO (research §R-02 de la 004): el servicio real de DNI/RUC no está
// contratado. Responde según la tabla fija de personas ficticias de
// specs/004-solicitud-consulta/quickstart.md; nunca contiene datos reales.

interface PersonaFicticia {
  readonly tipoDocumento: 'DNI' | 'CE';
  readonly numeroDocumento: string;
  readonly fechaEmision: string | null;
  /** RUC con el que coincide como titular; `null` si solo figura como representante. */
  readonly ruc: string | null;
}

const PERSONAS_FICTICIAS: readonly PersonaFicticia[] = [
  {
    tipoDocumento: 'DNI',
    numeroDocumento: '40000001',
    fechaEmision: '2020-01-15',
    ruc: '10400000011',
  },
  { tipoDocumento: 'DNI', numeroDocumento: '40000002', fechaEmision: '2019-05-10', ruc: null },
  { tipoDocumento: 'CE', numeroDocumento: '000123456', fechaEmision: null, ruc: '15000123456' },
];

/** Documento reservado para probar que el servicio no responde (503). */
export const DOCUMENTO_SERVICIO_CAIDO = '49999999';

const TIEMPO_ESPERA_MS = 3000;

const coincidePersona = (persona: PersonaAIdentificar, ficticia: PersonaFicticia): boolean =>
  persona.tipoDocumento === ficticia.tipoDocumento &&
  persona.numeroDocumento === ficticia.numeroDocumento &&
  (ficticia.fechaEmision === null || persona.fechaEmision === ficticia.fechaEmision);

export class ServicioIdentificacionSimulado implements ServicioIdentificacion {
  constructor(private readonly tiempoEsperaMs: number = TIEMPO_ESPERA_MS) {}

  async verificar(datos: DatosIdentificacion): Promise<ResultadoIdentificacion> {
    try {
      return await Promise.race([
        Promise.resolve(this.comparar(datos)),
        new Promise<ResultadoIdentificacion>((resolver) => {
          setTimeout(() => {
            resolver('NO_DISPONIBLE');
          }, this.tiempoEsperaMs).unref();
        }),
      ]);
    } catch {
      return 'NO_DISPONIBLE';
    }
  }

  private comparar(datos: DatosIdentificacion): ResultadoIdentificacion {
    const documentos = [datos.titular, datos.representante].filter(
      (persona): persona is PersonaAIdentificar => persona !== null,
    );
    if (documentos.some((persona) => persona.numeroDocumento === DOCUMENTO_SERVICIO_CAIDO)) {
      return 'NO_DISPONIBLE';
    }

    const titularValido = PERSONAS_FICTICIAS.some(
      (ficticia) =>
        ficticia.ruc !== null &&
        ficticia.ruc === datos.titular.ruc &&
        coincidePersona(datos.titular, ficticia),
    );
    const representante = datos.representante;
    const representanteValido =
      representante === null ||
      PERSONAS_FICTICIAS.some((ficticia) => coincidePersona(representante, ficticia));

    return titularValido && representanteValido ? 'COINCIDE' : 'NO_COINCIDE';
  }
}
