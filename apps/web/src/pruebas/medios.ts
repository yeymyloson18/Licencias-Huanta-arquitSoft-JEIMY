// Simulador de window.matchMedia para las pruebas (013, análisis C1): jsdom no lo trae, y lo usan el
// modo de color (prefers-color-scheme) y el menú lateral de CoreUI (anchos de pantalla). Por defecto
// responde MODO CLARO y ESCRITORIO; una prueba lo cambia con simularMedios() y los escuchas reciben
// el evento `change`. jest.setup.ts lo instala y lo reinicia después de cada prueba.

interface EstadoMedios {
  /** prefers-color-scheme: dark */
  readonly oscuro: boolean;
  /** Pantalla angosta (360 px): max-width verdadero, min-width falso. */
  readonly celular: boolean;
  /** prefers-reduced-motion: reduce */
  readonly movimientoReducido: boolean;
}

const POR_DEFECTO: EstadoMedios = { oscuro: false, celular: false, movimientoReducido: false };

type Escucha = (evento: MediaQueryListEvent) => void;

interface Lista {
  readonly consulta: string;
  readonly escuchas: Set<Escucha>;
  ultimo: boolean;
}

let estado: EstadoMedios = POR_DEFECTO;
const listas = new Set<Lista>();

/** Evalúa una consulta de medios sencilla con el estado simulado. */
export const evaluarConsulta = (consulta: string, medios: EstadoMedios = estado): boolean => {
  const texto = consulta.toLowerCase();
  if (texto.includes('prefers-color-scheme')) {
    return texto.includes('dark') ? medios.oscuro : !medios.oscuro;
  }
  if (texto.includes('prefers-reduced-motion')) {
    return texto.includes('reduce') && medios.movimientoReducido;
  }
  if (texto.includes('max-width')) {
    return medios.celular;
  }
  if (texto.includes('min-width')) {
    return !medios.celular;
  }
  return false;
};

const crearLista = (consulta: string): MediaQueryList => {
  const lista: Lista = { consulta, escuchas: new Set(), ultimo: evaluarConsulta(consulta) };
  listas.add(lista);
  const objeto = {
    media: consulta,
    onchange: null,
    get matches() {
      return evaluarConsulta(consulta);
    },
    addEventListener: (_tipo: string, escucha: Escucha) => {
      lista.escuchas.add(escucha);
    },
    removeEventListener: (_tipo: string, escucha: Escucha) => {
      lista.escuchas.delete(escucha);
    },
    addListener: (escucha: Escucha) => {
      lista.escuchas.add(escucha);
    },
    removeListener: (escucha: Escucha) => {
      lista.escuchas.delete(escucha);
    },
    dispatchEvent: () => true,
  };
  return objeto as unknown as MediaQueryList;
};

/** Instala window.matchMedia (jest.setup.ts). */
export const instalarMatchMedia = (): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: crearLista,
  });
};

/** Cambia el medio simulado y avisa a los escuchas cuyas consultas cambiaron de resultado. */
export const simularMedios = (cambios: Partial<EstadoMedios>): void => {
  estado = { ...estado, ...cambios };
  for (const lista of listas) {
    const ahora = evaluarConsulta(lista.consulta);
    if (ahora !== lista.ultimo) {
      lista.ultimo = ahora;
      const evento = { matches: ahora, media: lista.consulta } as MediaQueryListEvent;
      for (const escucha of lista.escuchas) {
        escucha(evento);
      }
    }
  }
};

/** Vuelve al modo claro y escritorio, sin escuchas (afterEach de jest.setup.ts). */
export const reiniciarMedios = (): void => {
  estado = POR_DEFECTO;
  listas.clear();
};
