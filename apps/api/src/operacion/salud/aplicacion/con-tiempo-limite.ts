export class TiempoAgotado extends Error {
  constructor(readonly milisegundos: number) {
    super(`Sin respuesta en ${String(milisegundos)} ms`);
    this.name = 'TiempoAgotado';
  }
}

/**
 * Rechaza con `TiempoAgotado` si la promesa no termina en `milisegundos`. Siempre limpia el
 * temporizador, para no dejar trabajo pendiente en el bucle de eventos.
 */
export const conTiempoLimite = <T>(promesa: Promise<T>, milisegundos: number): Promise<T> => {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => {
      rechazar(new TiempoAgotado(milisegundos));
    }, milisegundos);
  });

  return Promise.race([promesa, limite]).finally(() => {
    clearTimeout(temporizador);
  });
};
