# Plan de implementación: Evaluación del expediente, esquela de pago y pago en caja

**Rama**: `005-esquela-pago` | **Fecha**: 2026-11-20 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación (con las aclaraciones del 2026-11-20) y la sección "Cómo construirlo" de
`docs/sdd/005-evaluacion-pago.md`.

## Resumen

Se completan dos módulos:

- **`tramites`**: máquina de estados del expediente en el dominio; decisiones del evaluador (empezar
  revisión, confirmar o corregir el riesgo, observar una sola vez, denegar y aprobar) con bloqueo
  optimista; subsanación (en línea con la identidad del titular o en mesa de partes); consumidor del
  evento `PagoRegistrado`; auditoría del expediente para jefatura; nombre del titular para caja.
- **`pagos`** (hoy vacío): esquela (una por expediente) creada desde el evento `EsquelaSolicitada`,
  PDF, registro atómico del pago, corrección del recibo y auditoría de pagos.

Una pieza compartida: el **despachador de eventos** de `comun.evento_pendiente` (research §R-02), y
una ampliación de `seguridad`: el `tokenConsulta` para descargar la esquela sin cuenta. En el portal:
botones del evaluador en el detalle, pantallas de caja y de auditoría, y la esquela en la consulta.

**Primero el contrato y el modelo** (principios II y III): `openapi.yaml` según
[contracts/openapi-cambios.md](./contracts/openapi-cambios.md), y la migración `0008_evaluacion_pago`
con `docs/05-modelo-de-datos/` según [data-model.md](./data-model.md).

**Dónde este plan se aparta de la entrada** (la constitución prevalece):

| Entrada | Plan | Motivo |
| --- | --- | --- |
| La esquela se genera "en la misma transacción" que confirma el riesgo | El estado y el evento `EsquelaSolicitada` van en una transacción; `pagos` crea la esquela al consumir el evento | Cada módulo escribe solo su esquema (principios I y III); la propia entrada pedía decidir así (research §R-01) |
| Riesgo por nivel (`nivelRiesgo`) | Riesgo por licencia (`codigoReceta`) del mismo grupo | Un nivel no distingue cesionario de establecimiento y la corporativa no tiene nivel (research §R-04) |
| Recibo de 1 a 30 caracteres (aclaración) | De 4 a 30, como ya declara el contrato | No cambiar el contrato sin motivo (principio II) |
| Plazo de subsanación obligatorio en el contrato | Opcional (columna NULL en 0008) | Los plazos en días hábiles son de la 006 |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5.x estricto sobre Node.js 24 (igual que la 001 a la 004).

**Dependencias**: las de la 004. Se agrega **una** dependencia de ejecución, `pdf-lib`, para el PDF de
la esquela (research §R-07).

**Almacenamiento**: PostgreSQL 16 (esquemas `tramites`, `pagos` y `comun`); Redis sin cambios.

**Pruebas**: Jest (unitarias de dominio y casos de uso), Supertest con validación contra el contrato
(integración, PostgreSQL temporal en 5433 y Redis en 16379), Jest + Testing Library (portal).

**Plataforma**: API NestJS sin estado detrás del nginx del portal; el despachador y su candado
permiten varias réplicas.

**Tipo de proyecto**: monorepo web (API + portal + contrato).

**Metas de desempeño**: el expediente pasa a PAGADO y la esquela aparece en 30 s o menos (SC-004; el
despachador corre cada 2 s).

**Restricciones**: un esquema por módulo, sin FK entre esquemas; ningún dato personal en registros,
URL, auditoría ni PDF; cobertura ≥ 80 % por archivo en `dominio` y `aplicacion`.

**Escala**: la de la 004 (cientos de expedientes por mes).

## Verificación constitucional

| Principio | Cumplimiento |
| --- | --- |
| I. Monolito modular y Clean Architecture | `tramites` y `pagos` se hablan por fachadas (`FachadaTramites.estadoParaPago`, `FachadaPagos.esquelaDelExpediente`) y por eventos; el dominio no importa NestJS ni Prisma. dependency-cruiser lo verifica |
| II. Contrato primero | `openapi.yaml` se cambia en la fase 2, antes de los controladores |
| III. Modelo por módulo | Migración 0008 solo en `tramites`; `pagos` escribe solo `pagos.*`; el estado del expediente lo cambia solo `tramites` (al consumir `PagoRegistrado`) |
| IV. TypeScript estricto y español | Nombres del dominio en español: `Esquela`, `RegistrarPagoEnCaja`, `PagoRegistrado`, `MaquinaEstados` |
| V. Pruebas | Unitarias por cada regla y caso de uso; integración por cada endpoint y por el flujo completo |
| VI. Escenarios de calidad | EQ-04 (matriz 401/403, auditoría, privacidad), EQ-02/EQ-03 (pago único y reintentos), EQ-06 (aislamiento). k6, Lighthouse y ZAP se miden en el despliegue (007), como decidió la usuaria |
| VII. Datos personales | Eventos, auditoría, errores y PDF sin datos del titular; el nombre del titular solo en la pantalla de caja; prueba de privacidad |
| VIII. Git | Rama `005-esquela-pago`, commit por fase, sin push (lo hace la usuaria) |

Resultado: sin violaciones. Se repite tras el diseño: sin cambios.

## Estructura del proyecto

### Documentación

```text
specs/005-evaluacion-pago/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/openapi-cambios.md
├── contracts/portal-evaluacion-pago.md
└── tasks.md (lo crea /speckit-tasks)
```

### Código fuente

```text
apps/api/
├── prisma/migrations/0008_evaluacion_pago/migration.sql
├── src/compartido/infraestructura/despachador-eventos.ts          # research §R-02
├── src/modulos/catalogo/fachada.ts                                 # + obtenerRecetaParaEvaluacion
├── src/modulos/seguridad/                                          # + tokenConsulta y ConsultaOPersonalGuard
├── src/modulos/tramites/
│   ├── dominio/maquina-estados.ts, grupo-licencia.ts, observacion.ts
│   ├── aplicacion/iniciar-evaluacion.ts, confirmar-riesgo.ts, observar-expediente.ts,
│   │              denegar-expediente.ts, aprobar-expediente.ts, subsanar-observacion.ts,
│   │              aplicar-pago-registrado.ts, consultar-auditoria-expediente.ts
│   ├── infraestructura/repositorio-decisiones-postgres.ts, catalogo-evaluacion-fachada.ts,
│   │                   esquelas-fachada.ts (consulta pública)
│   ├── presentacion/evaluacion.controller.ts, subsanacion.controller.ts, auditoria.controller.ts
│   └── fachada.ts                                                  # estadoParaPago, nombreTitular
└── src/modulos/pagos/
    ├── dominio/esquela.ts, numero-recibo.ts, puertos/*
    ├── aplicacion/generar-esquela.ts, consultar-esquela.ts, registrar-pago-en-caja.ts,
    │              corregir-numero-recibo.ts, consultar-auditoria-pagos.ts, generar-pdf-esquela.ts
    ├── infraestructura/repositorio-esquelas-postgres.ts, pdf-esquela-pdflib.ts, tramites-fachada.ts
    ├── presentacion/esquelas.controller.ts, auditoria-pagos.controller.ts
    ├── fachada.ts                                                  # esquelaDelExpediente
    └── pagos.module.ts

apps/web/src/
├── paginas/personal/DetalleExpediente.tsx                          # + acciones del evaluador
├── paginas/personal/Caja.tsx, Auditoria.tsx
├── componentes/AccionesEvaluador.tsx
└── paginas/Consulta.tsx                                            # + esquela y observación
```

## Seguimiento de complejidad

Ninguna violación que justificar. La única dependencia nueva (`pdf-lib`) está justificada en research
§R-07.
