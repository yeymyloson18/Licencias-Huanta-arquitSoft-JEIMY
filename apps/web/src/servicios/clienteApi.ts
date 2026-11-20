import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from '@licencias/contracts';
import { obtenerToken, type SesionPersonal } from '../sesion/almacen-sesion';
import { renovarSesion } from '../sesion/renovacion';

export type RecetaResumen = components['schemas']['RecetaResumen'];
export type Receta = components['schemas']['Receta'];
export type PreguntaAsistente = components['schemas']['PreguntaAsistente'];
export type ResultadoAsistente = components['schemas']['ResultadoAsistente'];
export type RecetaAdminResumen = components['schemas']['RecetaAdminResumen'];
export type RecetaAdmin = components['schemas']['RecetaAdmin'];
export type RecetaEditable = components['schemas']['RecetaEditable'];
export type DesafioOtp = components['schemas']['DesafioOtp'];
export type NuevaSolicitud = components['schemas']['NuevaSolicitud'];
export type ExpedienteRegistrado = components['schemas']['ExpedienteRegistrado'];
export type IdentidadSolicitud = components['schemas']['SolicitudVerificacionIdentidad'];
export type EstadoPublico = components['schemas']['EstadoPublico'];
export type ExpedienteResumen = components['schemas']['ExpedienteResumen'] & {
  readonly nombreLicencia?: string;
};
export type Expediente = components['schemas']['Expediente'] & { readonly nombreLicencia?: string };
export type EstadoExpediente = components['schemas']['EstadoExpediente'];
export type { SesionPersonal };

const TIEMPO_LIMITE_MS = 10_000;

// Copias de cada petición (por id del middleware) para poder repetirla tras renovar el token.
const copias = new Map<string, Request>();

const conToken = (peticion: Request, token: string | null): Request => {
  if (token !== null) {
    peticion.headers.set('Authorization', `Bearer ${token}`);
  }
  return peticion;
};

/**
 * Agrega el token de acceso (que vive solo en memoria) y, ante un 401 fuera de /auth, renueva la
 * sesión una vez y repite la petición con el token nuevo (contracts/portal-seguridad.md).
 */
const middlewareSesion: Middleware = {
  onRequest({ request, id }) {
    const peticion = conToken(request, obtenerToken());
    copias.set(id, peticion.clone());
    return peticion;
  },
  async onResponse({ response, schemaPath, id }) {
    const copia = copias.get(id);
    copias.delete(id);
    if (response.status !== 401 || schemaPath.startsWith('/auth/') || copia === undefined) {
      return response;
    }
    if (!(await renovarSesion())) {
      return response;
    }
    return globalThis.fetch(conToken(copia, obtenerToken()));
  },
};

// Cliente tipado con el contrato OpenAPI. La API se sirve desde el mismo origen (/api/v1):
// nginx en Docker y el proxy de Vite en desarrollo. `fetch` se resuelve en cada llamada (no al
// crear el cliente) para poder sustituirlo en pruebas; same-origin envía la cookie de renovación.
const cliente = createClient<paths>({
  baseUrl: new URL('/api/v1', window.location.origin).href,
  credentials: 'same-origin',
  fetch: (peticion) => globalThis.fetch(peticion),
});
cliente.use(middlewareSesion);

/** Error genérico: el portal nunca muestra detalles técnicos al administrado (FR-015). */
export class CatalogoNoDisponible extends Error {
  constructor() {
    super('Catálogo no disponible');
    this.name = 'CatalogoNoDisponible';
  }
}

/**
 * Ejecuta una lectura pública del catálogo con límite de 10 s. Cualquier falla (red, tiempo, estado
 * distinto de 200) se convierte en `CatalogoNoDisponible`, sin detalles técnicos (FR-015).
 */
async function leerCatalogo<T>(
  peticion: (signal: AbortSignal) => Promise<{ data?: T; response: Response }>,
  siNoEncontrada?: T,
): Promise<T> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => {
    controlador.abort();
  }, TIEMPO_LIMITE_MS);

  try {
    const { data, response } = await peticion(controlador.signal);
    if (siNoEncontrada !== undefined && (response.status === 404 || response.status === 422)) {
      return siNoEncontrada;
    }
    if (response.status !== 200 || data === undefined) {
      throw new CatalogoNoDisponible();
    }
    return data;
  } catch {
    throw new CatalogoNoDisponible();
  } finally {
    clearTimeout(temporizador);
  }
}

/** Licencias del catálogo (solo tipo LICENCIA). Aborta a los 10 s. */
export const listarLicencias = (): Promise<RecetaResumen[]> =>
  leerCatalogo((signal) =>
    cliente.GET('/catalogo/recetas', { params: { query: { tipo: 'LICENCIA' } }, signal }),
  );

/**
 * Ficha pública de una receta (historia 2 de la 003). Devuelve `null` si no existe, está
 * desactivada (404) o el código no tiene el formato del TUPA (422): para el visitante es lo mismo.
 */
export const obtenerFicha = (codigo: string): Promise<Receta | null> =>
  leerCatalogo<Receta | null>(
    (signal) =>
      cliente.GET('/catalogo/recetas/{codigoReceta}', {
        params: { path: { codigoReceta: codigo } },
        signal,
      }),
    null,
  );

// ----------------------------------------------------------------------------- asistente (003)

/** Preguntas del asistente en orden, con sus opciones del catálogo (contracts/asistente.md). */
export const obtenerPreguntas = (): Promise<PreguntaAsistente[]> =>
  leerCatalogo((signal) => cliente.GET('/asistente/preguntas', { signal }));

/** Propuesta del asistente: `PROPUESTA` con la receta o `NO_DETERMINADA` (FR-005, FR-006). */
export const proponerLicencia = (
  respuestas: Readonly<Record<string, string>>,
): Promise<ResultadoAsistente> =>
  leerCatalogo((signal) =>
    cliente.POST('/asistente/proponer', { body: { respuestas: { ...respuestas } }, signal }),
  );

// ----------------------------------------------------------------------------- autenticación

export interface ErrorCampo {
  readonly campo: string;
  readonly mensaje: string;
}

/** Resultado de una operación de /auth, sin detalles técnicos para la pantalla. */
export type ResultadoAuth<T> =
  | { readonly tipo: 'ok'; readonly datos: T }
  | { readonly tipo: 'credenciales' }
  | { readonly tipo: 'bloqueado'; readonly reintentarEn: Date }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  | { readonly tipo: 'no-disponible' };

/** `error` es el cuerpo ya leído por openapi-fetch (la respuesta no se puede volver a leer). */
const resultadoDeError = <T>(respuesta: Response, error: unknown): ResultadoAuth<T> => {
  switch (respuesta.status) {
    case 401:
      return { tipo: 'credenciales' };
    case 429: {
      const segundos = Number(respuesta.headers.get('Retry-After') ?? '0');
      return {
        tipo: 'bloqueado',
        reintentarEn: new Date(Date.now() + Math.max(0, segundos) * 1000),
      };
    }
    case 422: {
      const errores = (error as { errores?: ErrorCampo[] } | undefined)?.errores;
      return { tipo: 'invalido', errores: errores ?? [] };
    }
    default:
      return { tipo: 'no-disponible' };
  }
};

const ejecutarAuth = async <T>(
  llamada: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ResultadoAuth<T>> => {
  try {
    const { data, error, response } = await llamada();
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', datos: data };
    }
    return resultadoDeError<T>(response, error);
  } catch {
    return { tipo: 'no-disponible' };
  }
};

export const iniciarSesion = (correo: string, clave: string) =>
  ejecutarAuth(() => cliente.POST('/auth/iniciar-sesion', { body: { correo, clave } }));

export const verificarOtp = (desafioId: string, codigo: string) =>
  ejecutarAuth(() => cliente.POST('/auth/verificar-otp', { body: { desafioId, codigo } }));

export const cambiarClave = (claveActual: string, claveNueva: string) =>
  ejecutarAuth(() => cliente.POST('/auth/cambiar-clave', { body: { claveActual, claveNueva } }));

/** Cierra la sesión del navegador (la cookie). Nunca falla: si no hay red, la sesión vence sola. */
export async function cerrarSesion(): Promise<void> {
  try {
    await cliente.POST('/auth/cerrar-sesion');
  } catch {
    // Sin red: el portal igual descarta la sesión en memoria.
  }
}

// ----------------------------------------------------------------------------- gestión de usuarios

export type Usuario = components['schemas']['Usuario'];
export type Rol = components['schemas']['Rol'];
export type NuevoUsuario = components['schemas']['NuevoUsuario'];

export interface PaginaUsuarios {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly datos: Usuario[];
}

/** Resultado de una operación de administración, sin detalles técnicos para la pantalla. */
export type ResultadoOperacion<T> =
  | { readonly tipo: 'ok'; readonly datos: T }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  | { readonly tipo: 'correo-en-uso' }
  | { readonly tipo: 'ultimo-administrador' }
  | { readonly tipo: 'no-encontrado' }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'no-disponible' };

const tipoDeProblema = (error: unknown): string =>
  ((error as { type?: string } | undefined)?.type ?? '').split('/').pop() ?? '';

const ejecutarOperacion = async <T>(
  llamada: () => Promise<{ data?: T; error?: unknown; response: Response }>,
  vacio?: T,
): Promise<ResultadoOperacion<T>> => {
  try {
    const { data, error, response } = await llamada();
    if (response.ok) {
      const datos = data ?? vacio;
      return datos === undefined ? { tipo: 'no-disponible' } : { tipo: 'ok', datos };
    }
    switch (response.status) {
      case 422:
        return {
          tipo: 'invalido',
          errores: (error as { errores?: ErrorCampo[] } | undefined)?.errores ?? [],
        };
      case 409:
        return tipoDeProblema(error) === 'ultimo-administrador'
          ? { tipo: 'ultimo-administrador' }
          : { tipo: 'correo-en-uso' };
      case 404:
        return { tipo: 'no-encontrado' };
      case 401:
      case 403:
        return { tipo: 'sin-permiso' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

/** Lista el personal (los filtros no llevan datos personales, por eso van en la URL). */
export const listarUsuarios = (filtro: { activo?: boolean; pagina?: number }) =>
  ejecutarOperacion<PaginaUsuarios>(() =>
    cliente.GET('/usuarios', {
      params: {
        query: { pagina: filtro.pagina ?? 1, porPagina: 20, activo: filtro.activo },
      },
    }),
  );

/** Busca por nombre o correo con POST: el texto no queda en la URL (principio VII). */
export const buscarUsuarios = (filtro: { texto: string; activo?: boolean; pagina?: number }) =>
  ejecutarOperacion<PaginaUsuarios>(() =>
    cliente.POST('/usuarios/busqueda', {
      body: {
        texto: filtro.texto,
        pagina: filtro.pagina ?? 1,
        porPagina: 20,
        ...(filtro.activo === undefined ? {} : { activo: filtro.activo }),
      },
    }),
  );

export const crearUsuario = (datos: NuevoUsuario) =>
  ejecutarOperacion<Usuario>(() => cliente.POST('/usuarios', { body: datos }));

export const actualizarUsuario = (
  usuarioId: string,
  cambios: { nombreCompleto?: string; celular?: string; activo?: boolean },
) =>
  ejecutarOperacion<Usuario>(() =>
    cliente.PATCH('/usuarios/{usuarioId}', { params: { path: { usuarioId } }, body: cambios }),
  );

export const asignarRoles = (usuarioId: string, roles: Rol[]) =>
  ejecutarOperacion<Usuario>(() =>
    cliente.PUT('/usuarios/{usuarioId}/roles', {
      params: { path: { usuarioId } },
      body: { roles },
    }),
  );

export const asignarClaveTemporal = (usuarioId: string, claveTemporal: string) =>
  ejecutarOperacion<true>(
    () =>
      cliente.POST('/usuarios/{usuarioId}/clave-temporal', {
        params: { path: { usuarioId } },
        body: { claveTemporal },
      }),
    true,
  );

// ----------------------------------------------------------------------- catálogo: edición (003)

/** Las 12 recetas, activas y desactivadas (solo ADMINISTRADOR). */
export const listarRecetasAdmin = () =>
  ejecutarOperacion<RecetaAdminResumen[]>(() => cliente.GET('/admin/catalogo/recetas'));

/** Una receta para editarla, aunque esté desactivada (solo ADMINISTRADOR). */
export const obtenerRecetaAdmin = (codigo: string) =>
  ejecutarOperacion<RecetaAdmin>(() =>
    cliente.GET('/admin/catalogo/recetas/{codigoReceta}', {
      params: { path: { codigoReceta: codigo } },
    }),
  );

/**
 * Guarda los cambios de una receta. Además de los resultados de la 002, distingue la sesión vencida
 * (401, ya intentada la renovación) para que la pantalla conserve lo escrito y lleve a ingresar.
 */
export const actualizarReceta = async (
  codigo: string,
  cambios: RecetaEditable,
): Promise<ResultadoOperacion<RecetaAdmin> | { readonly tipo: 'no-autenticado' }> => {
  let estado = 0;
  const resultado = await ejecutarOperacion<RecetaAdmin>(async () => {
    const respuesta = await cliente.PUT('/catalogo/recetas/{codigoReceta}', {
      params: { path: { codigoReceta: codigo } },
      body: cambios,
    });
    estado = respuesta.response.status;
    return respuesta;
  });
  return estado === 401 ? { tipo: 'no-autenticado' } : resultado;
};

// ----------------------------------------------------------------- trámite en línea (004)

// Cliente sin el middleware de sesión del personal: el `tokenIdentidad` del administrado se envía
// explícitamente y nunca se mezcla con el token del personal (research §R-03 de la 004).
const clientePublico = createClient<paths>({
  baseUrl: new URL('/api/v1', window.location.origin).href,
  credentials: 'same-origin',
  fetch: (peticion) => globalThis.fetch(peticion),
});

const conIdentidad = (token: string) => ({ Authorization: `Bearer ${token}` });

const bloqueadoHasta = (respuesta: Response): Date => {
  const segundos = Number(respuesta.headers.get('Retry-After') ?? '0');
  return new Date(Date.now() + Math.max(0, segundos) * 1000);
};

const erroresDe = (error: unknown): readonly ErrorCampo[] =>
  (error as { errores?: ErrorCampo[] } | undefined)?.errores ?? [];

/** Resultado del paso 1 de la identidad (contracts/identidad-y-solicitud.md). */
export type ResultadoVerificacionIdentidad =
  | { readonly tipo: 'ok'; readonly datos: DesafioOtp }
  | { readonly tipo: 'no-coincide' }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  | { readonly tipo: 'bloqueado'; readonly reintentarEn: Date }
  | { readonly tipo: 'servicio-caido' }
  | { readonly tipo: 'no-disponible' };

export const verificarIdentidad = async (
  identidad: IdentidadSolicitud,
): Promise<ResultadoVerificacionIdentidad> => {
  try {
    const { data, error, response } = await clientePublico.POST('/identidad/verificar', {
      body: identidad,
    });
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', datos: data };
    }
    switch (response.status) {
      case 422: {
        const errores = erroresDe(error);
        return errores.some((falla) => falla.campo === 'identidad')
          ? { tipo: 'no-coincide' }
          : { tipo: 'invalido', errores };
      }
      case 429:
        return { tipo: 'bloqueado', reintentarEn: bloqueadoHasta(response) };
      case 503:
        return (error as { type?: string } | undefined)?.type?.endsWith(
          'identificacion-no-disponible',
        )
          ? { tipo: 'servicio-caido' }
          : { tipo: 'no-disponible' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

export type ResultadoCodigoIdentidad =
  | { readonly tipo: 'ok'; readonly token: string; readonly expiraEn: number }
  | { readonly tipo: 'codigo-incorrecto' }
  | { readonly tipo: 'bloqueado'; readonly reintentarEn: Date }
  | { readonly tipo: 'no-disponible' };

export const verificarCodigoIdentidad = async (
  desafioId: string,
  codigo: string,
): Promise<ResultadoCodigoIdentidad> => {
  try {
    const { data, response } = await clientePublico.POST('/identidad/verificar-otp', {
      body: { desafioId, codigo },
    });
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', token: data.token, expiraEn: data.expiraEn };
    }
    if (response.status === 401) {
      return { tipo: 'codigo-incorrecto' };
    }
    if (response.status === 429) {
      return { tipo: 'bloqueado', reintentarEn: bloqueadoHasta(response) };
    }
    return { tipo: 'no-disponible' };
  } catch {
    return { tipo: 'no-disponible' };
  }
};

export type ResultadoSubida =
  | { readonly tipo: 'ok'; readonly documentoId: string; readonly sha256: string }
  | { readonly tipo: 'demasiado-grande' }
  | { readonly tipo: 'tipo-no-permitido' }
  | { readonly tipo: 'no-autenticado' }
  | { readonly tipo: 'no-disponible' };

/** Sube un documento (multipart, campo `archivo`) con el token de identidad. */
export const subirDocumento = async (token: string, archivo: File): Promise<ResultadoSubida> => {
  const formulario = new FormData();
  formulario.append('archivo', archivo);
  try {
    const respuesta = await globalThis.fetch(
      new Request(new URL('/api/v1/documentos', window.location.origin), {
        method: 'POST',
        headers: conIdentidad(token),
        body: formulario,
      }),
    );
    switch (respuesta.status) {
      case 201: {
        const datos = (await respuesta.json()) as { documentoId: string; sha256: string };
        return { tipo: 'ok', documentoId: datos.documentoId, sha256: datos.sha256 };
      }
      case 413:
        return { tipo: 'demasiado-grande' };
      case 415:
        return { tipo: 'tipo-no-permitido' };
      case 401:
        return { tipo: 'no-autenticado' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

export type ResultadoPresentacion =
  | { readonly tipo: 'ok'; readonly expediente: ExpedienteRegistrado }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  | { readonly tipo: 'no-autenticado' }
  | { readonly tipo: 'identidad-distinta' }
  | { readonly tipo: 'permiso-usado' }
  | { readonly tipo: 'no-disponible' };

/** Presenta la solicitud en línea; la `Idempotency-Key` se reutiliza en los reintentos (FR-020). */
export const presentarSolicitud = async (
  token: string,
  solicitud: NuevaSolicitud,
  claveIdempotencia: string,
): Promise<ResultadoPresentacion> => {
  try {
    const { data, error, response } = await clientePublico.POST('/expedientes', {
      params: { header: { 'Idempotency-Key': claveIdempotencia } },
      headers: conIdentidad(token),
      body: solicitud,
    });
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', expediente: data };
    }
    switch (response.status) {
      case 422:
        return { tipo: 'invalido', errores: erroresDe(error) };
      case 401:
        return { tipo: 'no-autenticado' };
      case 403:
        return { tipo: 'identidad-distinta' };
      case 409:
        return { tipo: 'permiso-usado' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

// ----------------------------------------------------------------- consulta pública (004)

export type ResultadoConsulta =
  | { readonly tipo: 'ok'; readonly estado: EstadoPublico }
  | { readonly tipo: 'no-encontrado' }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  | { readonly tipo: 'bloqueado'; readonly reintentarEn: Date }
  | { readonly tipo: 'no-disponible' };

/**
 * Consulta el estado con el número y el documento en el cuerpo de un POST: nada queda en la URL ni
 * en el historial del navegador (contracts/portal-tramite.md).
 */
export const consultarEstado = async (
  numeroExpediente: string,
  documento: string,
): Promise<ResultadoConsulta> => {
  try {
    const { data, error, response } = await clientePublico.POST('/expedientes/consultar', {
      body: { numeroExpediente, documento },
    });
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', estado: data };
    }
    switch (response.status) {
      case 404:
        return { tipo: 'no-encontrado' };
      case 422:
        return { tipo: 'invalido', errores: erroresDe(error) };
      case 429:
        return { tipo: 'bloqueado', reintentarEn: bloqueadoHasta(response) };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

// ----------------------------------------------------------------- mesa de partes (004)

/** Sube un documento con la sesión de MESA_PARTES; ante un 401 renueva la sesión una vez. */
export const subirDocumentoPersonal = async (
  archivo: File,
): Promise<ResultadoSubida | { readonly tipo: 'sin-permiso' }> => {
  const intentar = async () => {
    const token = obtenerToken();
    if (token === null) {
      return { tipo: 'no-autenticado' } as const;
    }
    return subirDocumento(token, archivo);
  };
  const primero = await intentar();
  if (primero.tipo !== 'no-autenticado' || !(await renovarSesion())) {
    return primero;
  }
  return intentar();
};

export type ResultadoRegistroPresencial =
  | { readonly tipo: 'ok'; readonly expediente: ExpedienteRegistrado }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  | { readonly tipo: 'no-autenticado' }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'servicio-caido' }
  | { readonly tipo: 'no-disponible' };

/**
 * Registra la solicitud presencial con la sesión del personal (el middleware agrega el token y
 * renueva la sesión una vez). La misma `Idempotency-Key` en los reintentos (FR-020).
 */
export const registrarSolicitudPresencial = async (
  solicitud: NuevaSolicitud,
  claveIdempotencia: string,
): Promise<ResultadoRegistroPresencial> => {
  try {
    const { data, error, response } = await cliente.POST('/expedientes', {
      params: { header: { 'Idempotency-Key': claveIdempotencia } },
      body: solicitud,
    });
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', expediente: data };
    }
    switch (response.status) {
      case 422:
        return { tipo: 'invalido', errores: erroresDe(error) };
      case 401:
        return { tipo: 'no-autenticado' };
      case 403:
        return { tipo: 'sin-permiso' };
      case 503:
        return tipoDeProblema(error) === 'identificacion-no-disponible'
          ? { tipo: 'servicio-caido' }
          : { tipo: 'no-disponible' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

// ----------------------------------------------------------------- bandeja del personal (004)

export interface FiltroBandeja {
  readonly estado?: EstadoExpediente;
  readonly ruta?: 'A' | 'B' | 'C';
  readonly pagina?: number;
  readonly porPagina?: number;
}

export interface PaginaExpedientes {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly datos: readonly ExpedienteResumen[];
}

/** Bandeja de MESA_PARTES, EVALUADOR y JEFATURA (los filtros no son datos personales). */
export const listarExpedientes = (filtro: FiltroBandeja) =>
  ejecutarOperacion<PaginaExpedientes>(async () => {
    const respuesta = await cliente.GET('/expedientes', { params: { query: filtro } });
    return { ...respuesta, data: respuesta.data as PaginaExpedientes | undefined };
  });

/** Detalle del expediente (la API registra quién lo vio). */
export const obtenerExpediente = (numero: string) =>
  ejecutarOperacion<Expediente>(() =>
    cliente.GET('/expedientes/{numeroExpediente}', {
      params: { path: { numeroExpediente: numero } },
    }),
  );

/** Ruta de la API de un documento del expediente (la descarga necesita la sesión). */
export const urlDocumento = (numero: string, documentoId: string): string =>
  new URL(
    `/api/v1/expedientes/${encodeURIComponent(numero)}/documentos/${encodeURIComponent(documentoId)}`,
    window.location.origin,
  ).href;

export type ResultadoDescarga =
  | { readonly tipo: 'ok'; readonly archivo: Blob }
  | { readonly tipo: 'no-encontrado' }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'no-disponible' };

/**
 * Descarga un documento con el token de la sesión (que vive en memoria, por eso no sirve un enlace
 * directo). Ante un 401 renueva la sesión una vez.
 */
export const descargarDocumentoExpediente = async (
  numero: string,
  documentoId: string,
): Promise<ResultadoDescarga> => {
  const pedir = () => {
    const token = obtenerToken();
    return globalThis.fetch(
      new Request(urlDocumento(numero, documentoId), {
        headers: token === null ? {} : { Authorization: `Bearer ${token}` },
      }),
    );
  };
  try {
    let respuesta = await pedir();
    if (respuesta.status === 401 && (await renovarSesion())) {
      respuesta = await pedir();
    }
    if (respuesta.ok) {
      return { tipo: 'ok', archivo: await respuesta.blob() };
    }
    switch (respuesta.status) {
      case 404:
        return { tipo: 'no-encontrado' };
      case 401:
      case 403:
        return { tipo: 'sin-permiso' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

// ----------------------------------------------------------------- evaluación del expediente (005)

export type ResultadoDecision =
  | { readonly tipo: 'ok'; readonly expediente: Expediente }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  /** La acción no corresponde al estado (409) o el expediente cambió (412): hay que recargarlo. */
  | { readonly tipo: 'cambio'; readonly mensaje: string }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'no-encontrado' }
  | { readonly tipo: 'no-disponible' };

type AccionEvaluador = 'evaluacion' | 'riesgo' | 'observar' | 'denegar' | 'aprobar';

/** Envía una decisión del evaluador con la versión leída en `If-Match` (research §R-05 de la 005). */
const decidir = async (
  numero: string,
  accion: AccionEvaluador,
  version: number,
  cuerpo: Record<string, unknown> = {},
): Promise<ResultadoDecision> => {
  try {
    const token = obtenerToken();
    const pedir = () =>
      globalThis.fetch(
        new Request(
          new URL(
            `/api/v1/expedientes/${encodeURIComponent(numero)}/${accion}`,
            window.location.origin,
          ),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'If-Match': String(version),
              ...(obtenerToken() === null
                ? {}
                : { Authorization: `Bearer ${obtenerToken() ?? ''}` }),
            },
            body: JSON.stringify(cuerpo),
          },
        ),
      );
    let respuesta = await pedir();
    if (respuesta.status === 401 && token !== null && (await renovarSesion())) {
      respuesta = await pedir();
    }
    const datos: unknown = respuesta.headers.get('Content-Type')?.includes('json')
      ? await respuesta.json()
      : undefined;
    if (respuesta.ok) {
      return { tipo: 'ok', expediente: datos as Expediente };
    }
    switch (respuesta.status) {
      case 422:
        return { tipo: 'invalido', errores: erroresDe(datos) };
      case 409:
        return {
          tipo: 'cambio',
          mensaje:
            tipoDeProblema(datos) === 'ya-observado'
              ? 'Este expediente ya fue observado una vez.'
              : 'Esta acción ya no corresponde al estado del expediente.',
        };
      case 412:
        return { tipo: 'cambio', mensaje: 'El expediente cambió mientras lo revisabas.' };
      case 401:
      case 403:
        return { tipo: 'sin-permiso' };
      case 404:
        return { tipo: 'no-encontrado' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

export const iniciarEvaluacion = (numero: string, version: number) =>
  decidir(numero, 'evaluacion', version);

export const confirmarRiesgo = (
  numero: string,
  version: number,
  datos: { readonly codigoReceta?: string; readonly comentario?: string },
) => decidir(numero, 'riesgo', version, { ...datos });

export const observarExpediente = (numero: string, version: number, descripcion: string) =>
  decidir(numero, 'observar', version, { descripcion });

export const denegarExpediente = (numero: string, version: number, motivo: string) =>
  decidir(numero, 'denegar', version, { motivo });

export const aprobarExpediente = (numero: string, version: number) =>
  decidir(numero, 'aprobar', version);

// ----------------------------------------------------------------- caja (005)

export type Esquela = components['schemas']['Esquela'];

export type ResultadoEsquela =
  | { readonly tipo: 'ok'; readonly esquela: Esquela }
  | { readonly tipo: 'no-encontrada' }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'no-disponible' };

/** Busca la esquela por su código (rol CAJA). El código no es dato personal. */
export const consultarEsquela = async (codigo: string): Promise<ResultadoEsquela> => {
  try {
    const { data, response } = await cliente.GET('/esquelas/{codigoEsquela}', {
      params: { path: { codigoEsquela: codigo.trim().toUpperCase() } },
    });
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', esquela: data };
    }
    if (response.status === 404) {
      return { tipo: 'no-encontrada' };
    }
    return response.status === 401 || response.status === 403
      ? { tipo: 'sin-permiso' }
      : { tipo: 'no-disponible' };
  } catch {
    return { tipo: 'no-disponible' };
  }
};

/** Solo el nombre del titular, para confirmar antes de registrar el pago (rol CAJA). */
export const obtenerTitularParaCaja = async (
  numeroExpediente: string,
): Promise<{ readonly nombreTitular: string; readonly razonSocial: string | null } | null> => {
  try {
    const { data } = await cliente.GET('/expedientes/{numeroExpediente}/titular', {
      params: { path: { numeroExpediente } },
    });
    return data === undefined
      ? null
      : { nombreTitular: data.nombreTitular, razonSocial: data.razonSocial ?? null };
  } catch {
    return null;
  }
};

export type ResultadoPago =
  | { readonly tipo: 'ok'; readonly esquela: Esquela }
  | { readonly tipo: 'ya-pagada' }
  | { readonly tipo: 'recibo-repetido' }
  | { readonly tipo: 'no-corresponde'; readonly mensaje: string }
  | { readonly tipo: 'invalido'; readonly mensaje: string }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'no-disponible' };

/** Registra el pago con el número de recibo (rol CAJA). */
export const registrarPago = async (
  codigo: string,
  numeroRecibo: string,
): Promise<ResultadoPago> => {
  try {
    const { data, error, response } = await cliente.POST('/esquelas/{codigoEsquela}/pago', {
      params: { path: { codigoEsquela: codigo } },
      body: { numeroRecibo },
    });
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', esquela: data };
    }
    switch (response.status) {
      case 409: {
        const tipo = tipoDeProblema(error);
        if (tipo === 'esquela-ya-pagada') return { tipo: 'ya-pagada' };
        if (tipo === 'recibo-repetido') return { tipo: 'recibo-repetido' };
        return {
          tipo: 'no-corresponde',
          mensaje:
            (error as { title?: string } | undefined)?.title ?? 'No se puede pagar esta esquela.',
        };
      }
      case 422:
        return {
          tipo: 'invalido',
          mensaje: erroresDe(error)[0]?.mensaje ?? 'Revisa el número de recibo.',
        };
      case 401:
      case 403:
        return { tipo: 'sin-permiso' };
      default:
        return { tipo: 'no-disponible' };
    }
  } catch {
    return { tipo: 'no-disponible' };
  }
};

// ----------------------------------------------------------------- PDF de la esquela (005)

export type ResultadoPdfEsquela =
  | { readonly tipo: 'ok'; readonly pdf: Blob; readonly nombre: string }
  | { readonly tipo: 'en-generacion' }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'no-disponible' };

/**
 * Descarga el PDF de la esquela. Con `tokenConsulta` (administrado, de la consulta pública) o, si no se
 * pasa, con la sesión del personal (renueva una vez ante un 401). 202 → todavía se está generando.
 */
export const descargarPdfEsquela = async (
  codigo: string,
  tokenConsulta?: string,
): Promise<ResultadoPdfEsquela> => {
  try {
    const sesion = tokenConsulta === undefined ? obtenerToken() : null;
    const pedir = () => {
      const token = tokenConsulta ?? obtenerToken();
      return globalThis.fetch(
        new Request(
          new URL(`/api/v1/esquelas/${encodeURIComponent(codigo)}/pdf`, window.location.origin),
          { headers: token === null ? {} : { Authorization: `Bearer ${token}` } },
        ),
      );
    };
    let respuesta = await pedir();
    if (respuesta.status === 401 && sesion !== null && (await renovarSesion())) {
      respuesta = await pedir();
    }
    if (respuesta.status === 202) {
      return { tipo: 'en-generacion' };
    }
    if (respuesta.ok) {
      return { tipo: 'ok', pdf: await respuesta.blob(), nombre: `${codigo}.pdf` };
    }
    return respuesta.status === 401 || respuesta.status === 403
      ? { tipo: 'sin-permiso' }
      : { tipo: 'no-disponible' };
  } catch {
    return { tipo: 'no-disponible' };
  }
};

/** Entrega el archivo al navegador como descarga. */
export const guardarArchivo = (contenido: Blob, nombre: string): void => {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
};
