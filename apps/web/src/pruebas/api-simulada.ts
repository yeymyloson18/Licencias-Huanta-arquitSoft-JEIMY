// Ayuda de pruebas: reemplaza `fetch` y responde según "MÉTODO /ruta" (sin el prefijo /api/v1).
// Las rutas no declaradas responden 404, así una llamada inesperada hace fallar la prueba.

export type Manejador = (peticion: Request) => Response | Promise<Response>;

export const json = (cuerpo: unknown, status = 200, cabeceras: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
  });

export const problema = (status: number, tipo: string, cabeceras: Record<string, string> = {}) =>
  new Response(
    JSON.stringify({ type: `https://licencias.example.pe/errores/${tipo}`, title: tipo, status }),
    { status, headers: { 'Content-Type': 'application/problem+json', ...cabeceras } },
  );

export const sinContenido = () => new Response(null, { status: 204 });

export interface LlamadaRegistrada {
  readonly clave: string;
  readonly autorizacion: string | null;
  readonly cuerpo: unknown;
}

/** JSON si lo es; si no (por ejemplo, multipart), el texto tal cual. */
const leerCuerpo = (texto: string): unknown => {
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
};

/** Instala el fetch simulado y devuelve el registro de llamadas. */
export const simularApi = (manejadores: Record<string, Manejador>): LlamadaRegistrada[] => {
  const llamadas: LlamadaRegistrada[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (entrada, inicio) => {
    const peticion = entrada instanceof Request ? entrada : new Request(entrada, inicio);
    const ruta = new URL(peticion.url).pathname.replace(/^\/api\/v1/, '');
    const clave = `${peticion.method} ${ruta}`;
    const texto = peticion.method === 'GET' ? '' : await peticion.clone().text();
    llamadas.push({
      clave,
      autorizacion: peticion.headers.get('Authorization'),
      cuerpo: texto === '' ? undefined : leerCuerpo(texto),
    });
    const manejador = manejadores[clave];
    return manejador ? manejador(peticion) : new Response(null, { status: 404 });
  });
  return llamadas;
};

export const usuarioDePrueba = (cambios: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  correo: 'persona@ejemplo.pe',
  nombreCompleto: 'Persona de Prueba',
  celularEnmascarado: '9*****321',
  roles: ['CAJA'],
  activo: true,
  debeCambiarClave: false,
  ...cambios,
});

export const sesionDePrueba = (cambiosUsuario: Record<string, unknown> = {}, token = 'token-1') => {
  const usuario = usuarioDePrueba(cambiosUsuario);
  return {
    accessToken: token,
    expiraEn: 900,
    debeCambiarClave: usuario.debeCambiarClave,
    usuario,
  };
};
