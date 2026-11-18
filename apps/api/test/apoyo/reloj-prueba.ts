import type { Reloj } from '../../src/modulos/seguridad/dominio/puertos/reloj';

/** Reloj que la prueba adelanta a voluntad para comprobar vencimientos (código, sesión). */
export class RelojControlable implements Reloj {
  private desfaseMs = 0;

  ahora(): Date {
    return new Date(Date.now() + this.desfaseMs);
  }

  avanzar(segundos: number): void {
    this.desfaseMs += segundos * 1000;
  }

  reiniciar(): void {
    this.desfaseMs = 0;
  }
}
