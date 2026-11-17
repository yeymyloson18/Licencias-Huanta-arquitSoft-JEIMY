/** Puerto: comprueba que una dependencia responde. Resuelve si responde; rechaza si no. */
export interface SondaDependencia {
  comprobar(): Promise<void>;
}
