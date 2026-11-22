import { sembrarUsuarios } from './sistema';

/** Antes de los recorridos: usuarios de demostración con claves nuevas (una sola vez). */
export default function preparacionGlobal(): void {
  sembrarUsuarios();
}
