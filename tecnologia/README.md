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
export interface DatosEsquela {           // forma en que la esquela se guarda y se lee
  codigo: string;
  numeroExpediente: string;
  monto: number;
  numeroRecibo: string | null;
}

export class Esquela {
  private constructor(
    readonly codigo: string,
    readonly numeroExpediente: string,
    readonly monto: number,               // viene del catálogo, nunca se escribe a mano
    private numeroRecibo: string | null,
  ) {}

  static nueva(codigo: string, numeroExpediente: string, monto: number): Esquela {
    if (monto <= 0) throw new Error('Una esquela debe tener un monto mayor que cero');
    return new Esquela(codigo, numeroExpediente, monto, null);
  }

  static reconstruir(d: DatosEsquela): Esquela {        // al leerla de la base, conserva si ya fue pagada
    return new Esquela(d.codigo, d.numeroExpediente, d.monto, d.numeroRecibo);
  }

  static generarCodigo(numeroExpediente: string, secuencial: number): string {
    return `ESQ-${numeroExpediente}-${String(secuencial).padStart(2, '0')}`;   // ej.: ESQ-EXP-2026-0001-01
  }

  registrarPago(numeroRecibo: string): void {
    if (this.numeroRecibo) throw new Error('Esta esquela ya fue pagada');   // regla: se paga una sola vez
    this.numeroRecibo = numeroRecibo;
  }

  estaPagada(): boolean { return this.numeroRecibo !== null; }

  aDatos(): DatosEsquela {
    return { codigo: this.codigo, numeroExpediente: this.numeroExpediente, monto: this.monto, numeroRecibo: this.numeroRecibo };
  }
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
  siguienteSecuencial(numeroExpediente: string): Promise<number>;   // ATÓMICO: nunca entrega el mismo número dos veces
  guardarNueva(esquela: Esquela): Promise<void>;
  guardarPago(esquela: Esquela): Promise<boolean>;  // ATÓMICO: false si en la base ya estaba pagada
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

  // Se llama solo cuando el nivel de riesgo ya está confirmado (ADR-004)
  async ejecutar(numeroExpediente: string, codigoReceta: string): Promise<Esquela> {
    const monto = await this.catalogo.tasaDe(codigoReceta);                  // RF05: tasa del TUPA
    const secuencial = await this.esquelas.siguienteSecuencial(numeroExpediente);
    const esquela = Esquela.nueva(Esquela.generarCodigo(numeroExpediente, secuencial), numeroExpediente, monto);
    await this.esquelas.guardarNueva(esquela);
    await this.documentos.generarPdfEsquela(esquela);                        // el worker arma el PDF
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
    esquela.registrarPago(numeroRecibo);                         // 1.ª defensa: regla del dominio
    const guardado = await this.esquelas.guardarPago(esquela);   // 2.ª defensa: la base de datos
    if (!guardado) throw new Error('Esta esquela ya fue pagada');   // otro cajero la pagó al mismo tiempo
    await this.eventos.publicar({                                // Trámites reacciona y avanza el expediente
      codigoEsquela: esquela.codigo,
      numeroExpediente: esquela.numeroExpediente,
      numeroRecibo,
    });
  }
}
```

## 3. Infraestructura (adaptadores intercambiables)

El adaptador en memoria guarda **copias de los datos** (no el objeto), igual que una base de datos. Así el ejemplo
se comporta como PostgreSQL: cada lectura crea un objeto nuevo con `Esquela.reconstruir()`.

```typescript
// infraestructura/adaptadoresEnMemoria.ts
import { Esquela, DatosEsquela } from '../dominio/Esquela';
import { PagoRegistrado } from '../dominio/PagoRegistrado';
import { RepositorioEsquelas, ConsultaTasa, GeneradorDocumentos, PublicadorEventos } from '../dominio/contratos';

export class RepositorioEsquelasEnMemoria implements RepositorioEsquelas {
  private filas = new Map<string, DatosEsquela>();
  private contadores = new Map<string, number>();

  async buscarPorCodigo(codigo: string) {
    const fila = this.filas.get(codigo);
    return fila ? Esquela.reconstruir({ ...fila }) : null;
  }
  async siguienteSecuencial(numero: string) {
    const siguiente = (this.contadores.get(numero) ?? 0) + 1;
    this.contadores.set(numero, siguiente);
    return siguiente;
  }
  async guardarNueva(e: Esquela) {
    if (this.filas.has(e.codigo)) throw new Error('Código de esquela duplicado');
    this.filas.set(e.codigo, e.aDatos());
  }
  async guardarPago(e: Esquela) {
    const actual = this.filas.get(e.codigo);
    if (!actual || actual.numeroRecibo !== null) return false;   // ya estaba pagada
    this.filas.set(e.codigo, e.aDatos());
    return true;
  }
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

### Cómo lo cumple PostgreSQL (`RepositorioEsquelasPostgres`)

```sql
-- siguienteSecuencial: atómico, dos peticiones nunca reciben el mismo número
INSERT INTO contador_esquelas (numero_expediente, ultimo) VALUES ($1, 1)
ON CONFLICT (numero_expediente) DO UPDATE SET ultimo = contador_esquelas.ultimo + 1
RETURNING ultimo;

-- guardarPago: solo actualiza si la esquela sigue sin pagar
UPDATE esquelas SET numero_recibo = $2, pagada_en = now()
WHERE codigo = $1 AND numero_recibo IS NULL;
-- 1 fila actualizada = pago registrado (true); 0 filas = ya estaba pagada (false)
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

// Dos cajeros registran la MISMA esquela al mismo tiempo
const resultados = await Promise.allSettled([
  registrar.ejecutar(esquela.codigo, 'REC-000123'),
  registrar.ejecutar(esquela.codigo, 'REC-000124'),
]);
console.log(resultados.map(r => r.status));        // [ 'fulfilled', 'rejected' ] → solo un pago se registra
console.log(eventos.publicados.length);            // 1

const leida = await repo.buscarPorCodigo(esquela.codigo);
console.log(leida?.estaPagada());                  // true: al leerla de nuevo sigue pagada
```

## Qué demuestra este ejemplo

| Idea | Dónde se ve |
|---|---|
| El dominio no depende de la tecnología | `Esquela` y los contratos no importan nada externo. |
| Una sola fuente de la tasa | `GenerarEsquela` pide el monto a `ConsultaTasa`; nadie lo escribe a mano. |
| La esquela pagada sigue pagada al leerla | `Esquela.reconstruir()` recibe el número de recibo guardado. |
| Un solo pago aunque dos cajeros actúen a la vez | `guardarPago` es atómico: en PostgreSQL, `UPDATE ... WHERE numero_recibo IS NULL`. |
| Código de esquela único | `siguienteSecuencial` es atómico; en PostgreSQL usa un contador con `ON CONFLICT`. |
| Inversión de dependencias (DIP) | Los casos de uso reciben sus contratos por el constructor. |
| Adaptadores intercambiables (LSP) | El contrato exige que `siguienteSecuencial` y `guardarPago` sean atómicos; el adaptador en memoria y el de PostgreSQL lo cumplen, por eso se cambian sin tocar los casos de uso. |
| Límite entre módulos | Pagos no toca el `Expediente`: publica `PagoRegistrado` y Trámites reacciona. |
| Se prueba sin base de datos | Todo el ejemplo funciona en memoria. |