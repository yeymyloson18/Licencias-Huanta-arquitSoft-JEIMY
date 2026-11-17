// Entorno jsdom con las API web de Node (fetch, Request, Response…), que jsdom no trae y que usa
// openapi-fetch. AbortController/AbortSignal también se toman de Node: el Request de Node rechaza
// las señales creadas por jsdom.
const modulo = require('jest-environment-jsdom');
const EntornoJsdom = modulo.TestEnvironment ?? modulo.default;

const GLOBALES_DE_NODE = [
  'fetch',
  'Request',
  'Response',
  'Headers',
  'FormData',
  'Blob',
  'ReadableStream',
  'TextEncoder',
  'TextDecoder',
  'AbortController',
  'AbortSignal',
  'structuredClone',
];

class EntornoJsdomConFetch extends EntornoJsdom {
  constructor(config, contexto) {
    super(config, contexto);
    for (const nombre of GLOBALES_DE_NODE) {
      this.global[nombre] = globalThis[nombre];
    }
  }
}

module.exports = EntornoJsdomConFetch;
