# Tecnología – Ejemplo de Clean Architecture

Esta carpeta guarda los recursos tecnológicos del proyecto, separados de la documentación (`docs/`).
Aquí se muestra **cómo se vería en código** el enfoque Clean Architecture para el flujo de
**pago en caja con esquela** (ADR-003 y ADR-004).

> No es una funcionalidad terminada: es un ejemplo para comprobar que el diseño es implementable.

## Stack propuesto

| Parte | Tecnología propuesta |
|---|---|
| Portal Web (computadora y celular) | React + TypeScript |
| Backend API | Node.js + NestJS (TypeScript) |
| Base de datos | PostgreSQL |
| Caché | Redis |
| Cola de tareas | Cola de mensajes + workers en Node.js |
| Contenedores y despliegue | Docker en la nube o en el centro de datos municipal |
| Control de versiones | Git y GitHub |

## Estructura del ejemplo

```
src/modulos/pagos/
├── dominio/           Esquela.ts, PagoRegistrado.ts, contratos.ts
├── aplicacion/        GenerarEsquela.ts, RegistrarPagoEnCaja.ts
├── infraestructura/   adaptadoresEnMemoria.ts
└── composicion.ts     conecta contratos con adaptadores
```

## 1. Dominio (no importa nada externo)

```typescript
// dominio/Esquela.ts
export class Esquela {
  private numeroRecibo: string | null = null;

  constructor(
    readonly codigo: string,              // código único impreso en la esquela
    readonly numeroExpediente: string,
    readonly monto: number,               // viene del catálogo, nunca se escribe a mano
  ) {
    if (monto <= 0) throw new Error('Una esquela debe tener un monto mayor que cero');
  }

  static generarCodigo(numeroExpediente: string, secuencial: number): string {
    return `ESQ-${numeroExpediente}-${String(secuencial).padStart(2, '0')}`;   // ej.: ESQ-EXP-2026-0001-01
  }

  registrarPago(numeroRecibo: string): void {
    if (this.numeroRecibo) throw new Error('Esta esquela ya fue pagada');   // regla: se paga una sola vez
    this.numeroRecibo = numeroRecibo;
  }

  estaPagada(): boolean { return this.numeroRecibo !== null; }
  recibo(): string | null { return this.numeroRecibo; }
}

// dominio/PagoRegistrado.ts  (evento de dominio)
export interface PagoRegistrado {
  codigoEsquela: string;
  numeroExpediente: string;
  numeroRecibo: string;
}

// dominio/contratos.ts  (puertos)
import { Esquela } from './Esquela';
import { PagoRegistrado } from './PagoRegistrado';

export interface RepositorioEsquelas {
  buscarPorCodigo(codigo: string): Promise<Esquela | null>;
  contarPorExpediente(numeroExpediente: string): Promise<number>;
  guardar(esquela: Esquela): Promise<void>;
}

export interface ConsultaTasa {            // la tasa vive solo en el catálogo (ADR-002)
  tasaDe(codigoReceta: string): Promise<number>;
}

export interface GeneradorDocumentos {
  generarPdfEsquela(esquela: Esquela): Promise<void>;
}

export interface PublicadorEventos {
  publicar(evento: PagoRegistrado): Promise<void>;
}
```

## 2. Aplicación (casos de uso)

```typescript
// aplicacion/GenerarEsquela.ts
import { Esquela } from '../dominio/Esquela';
import { RepositorioEsquelas, ConsultaTasa, GeneradorDocumentos } from '../dominio/contratos';

export class GenerarEsquela {
  constructor(                                        // DIP: depende solo de contratos
    private readonly esquelas: RepositorioEsquelas,
    private readonly catalogo: ConsultaTasa,
    private readonly documentos: GeneradorDocumentos,
  ) {}

  async ejecutar(numeroExpediente: string, codigoReceta: string): Promise<Esquela> {
    const monto = await this.catalogo.tasaDe(codigoReceta);              // RF05: tasa del TUPA
    const secuencial = (await this.esquelas.contarPorExpediente(numeroExpediente)) + 1;
    const codigo = Esquela.generarCodigo(numeroExpediente, secuencial);  // código único
    const esquela = new Esquela(codigo, numeroExpediente, monto);
    await this.esquelas.guardar(esquela);
    await this.documentos.generarPdfEsquela(esquela);                    // el worker arma el PDF
    return esquela;
  }
}

// aplicacion/RegistrarPagoEnCaja.ts
import { RepositorioEsquelas, PublicadorEventos } from '../dominio/contratos';

export class RegistrarPagoEnCaja {
  constructor(
    private readonly esquelas: RepositorioEsquelas,
    private readonly eventos: PublicadorEventos,
  ) {}

  async ejecutar(codigo: string, numeroRecibo: string): Promise<void> {
    const esquela = await this.esquelas.buscarPorCodigo(codigo);
    if (!esquela) throw new Error('Esquela no encontrada');
    esquela.registrarPago(numeroRecibo);
    await this.esquelas.guardar(esquela);
    await this.eventos.publicar({                      // Trámites reacciona y avanza el expediente
      codigoEsquela: esquela.codigo,
      numeroExpediente: esquela.numeroExpediente,
      numeroRecibo,
    });
  }
}
```

## 3. Infraestructura (adaptadores intercambiables)

```typescript
// infraestructura/adaptadoresEnMemoria.ts – en producción: PostgreSQL, fachada del Catálogo, cola y NestJS
import { Esquela } from '../dominio/Esquela';
import { PagoRegistrado } from '../dominio/PagoRegistrado';
import { RepositorioEsquelas, ConsultaTasa, GeneradorDocumentos, PublicadorEventos } from '../dominio/contratos';

export class RepositorioEsquelasEnMemoria implements RepositorioEsquelas {
  private datos = new Map<string, Esquela>();
  async buscarPorCodigo(codigo: string) { return this.datos.get(codigo) ?? null; }
  async contarPorExpediente(numero: string) {
    return [...this.datos.values()].filter(e => e.numeroExpediente === numero).length;
  }
  async guardar(e: Esquela) { this.datos.set(e.codigo, e); }
}

export class ConsultaTasaEnMemoria implements ConsultaTasa {
  private tasas = new Map<string, number>([['LIC-01', 159.50], ['LIC-03', 305.90]]);   // TUPA 2024
  async tasaDe(codigoReceta: string) {
    const tasa = this.tasas.get(codigoReceta);
    if (tasa === undefined) throw new Error('Receta sin tasa en el catálogo');
    return tasa;
  }
}

export class GeneradorDocumentosFalso implements GeneradorDocumentos {
  async generarPdfEsquela(e: Esquela) { console.log(`PDF encolado para ${e.codigo}`); }
}

export class PublicadorEventosEnMemoria implements PublicadorEventos {
  publicados: PagoRegistrado[] = [];
  async publicar(evento: PagoRegistrado) { this.publicados.push(evento); }
}
```

## 4. Composición (único lugar que elige los adaptadores)

```typescript
// composicion.ts
import { GenerarEsquela } from './aplicacion/GenerarEsquela';
import { RegistrarPagoEnCaja } from './aplicacion/RegistrarPagoEnCaja';
import {
  RepositorioEsquelasEnMemoria, ConsultaTasaEnMemoria,
  GeneradorDocumentosFalso, PublicadorEventosEnMemoria,
} from './infraestructura/adaptadoresEnMemoria';

const repo = new RepositorioEsquelasEnMemoria();        // en producción: RepositorioEsquelasPostgres
const eventos = new PublicadorEventosEnMemoria();
const generar = new GenerarEsquela(repo, new ConsultaTasaEnMemoria(), new GeneradorDocumentosFalso());
const registrar = new RegistrarPagoEnCaja(repo, eventos);

const esquela = await generar.ejecutar('EXP-2026-0001', 'LIC-01');   // riesgo bajo: S/ 159.50 del catálogo
console.log(esquela.codigo, esquela.monto);                          // ESQ-EXP-2026-0001-01 159.5

await registrar.ejecutar(esquela.codigo, 'REC-000123');              // caja registra el pago
console.log(esquela.estaPagada(), eventos.publicados.length);        // true 1

await registrar.ejecutar(esquela.codigo, 'REC-000124');              // Error: Esta esquela ya fue pagada
```

## Qué demuestra este ejemplo

| Idea | Dónde se ve |
|---|---|
| El dominio no depende de la tecnología | `Esquela` y los contratos no importan nada externo. |
| Una sola fuente de la tasa | `GenerarEsquela` pide el monto a `ConsultaTasa`; nadie lo escribe a mano. |
| Código de esquela único | `ESQ-<expediente>-<secuencial>`; en PostgreSQL se refuerza con una restricción UNIQUE. |
| Inversión de dependencias (DIP) | Los casos de uso reciben sus contratos por el constructor. |
| Adaptadores intercambiables (LSP) | Los adaptadores en memoria se reemplazan por PostgreSQL, la fachada del Catálogo y la cola sin cambiar los casos de uso. |
| Límite entre módulos | Pagos no toca el `Expediente`: publica `PagoRegistrado` y Trámites reacciona. |
| Regla de negocio en el dominio | Una esquela solo puede pagarse una vez. |
| Se prueba sin base de datos | Todo el ejemplo funciona en memoria. |