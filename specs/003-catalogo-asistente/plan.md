# Plan de implementación: Catálogo y Asistente de ruta

**Rama**: `003-catalogo-asistente` | **Fecha**: 2026-11-18 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación `specs/003-catalogo-asistente/spec.md` (con 5 aclaraciones del
2026-11-18) y el plan técnico `docs/sdd/003-catalogo-plan.md`.

## Resumen

Se completa el módulo `catalogo` sobre lo que ya construyeron la 001 (lista pública con caché) y la
002 (sesión y roles). Incluye cuatro piezas:

- **Asistente de ruta.** Muestra tres preguntas leídas del catálogo. Las respuestas las evalúa un
  motor de reglas que es una función pura del dominio: elige la primera regla que coincide por
  prioridad. El resultado tiene dos formas: `PROPUESTA` o `NO_DETERMINADA`.
- **Ficha pública de cada licencia.** Una receta desactivada responde 404.
- **Edición de recetas, solo para ADMINISTRADOR.** Las validaciones de dominio incluyen la
  coherencia entre ruta, calificación e ITSE. Cada cambio queda registrado con sus valores antes y
  después, en la misma transacción que el cambio. Si dos administradores guardan a la vez, gana el
  último, y el bloqueo de la fila asegura que el valor "antes" de cada registro sea correcto.
- **Caché con invalidación al guardar.** El cambio se ve en la siguiente consulta y, como máximo, en
  5 minutos aunque falle la invalidación (240 s en Redis + 60 s en el navegador).

En el portal hay cuatro pantallas pensadas primero para el celular: `/asistente`,
`/licencias/:codigo`, `/admin/catalogo` y `/admin/catalogo/:codigo`. También se agrega el primer
script de k6 para EQ-01.

**Primero el contrato y el modelo** (principios II y III), en el mismo PR y antes del código:

1. `docs/06-contrato-api/openapi.yaml`, según [contracts/openapi-cambios.md](./contracts/openapi-cambios.md).
2. La migración `0004_catalogo_asistente` y la actualización de `docs/05-modelo-de-datos/`, según
   [data-model.md](./data-model.md).

**Dónde este plan se aparta de la entrada** (la constitución prevalece y la entrada no lo prevé):

| Entrada | Plan | Motivo |
|---|---|---|
| "Actualizar `datos-semilla.sql`" con "No lo sé" | `0002` queda congelada con SHA-256; `datos-semilla.sql` pasa a describir el estado actual; `esquema-equivalente` compara también los datos del catálogo | La prueba de la 001 exige `0002 == datos-semilla.sql` y `0002` ya está aplicada. Es la misma solución que dio la 002 para `0001` (research §R-08) |
| `PUT` con la misma forma de `RecetaEditable` | Requisitos con `id` opcional (sin `id` se crea uno nuevo); el orden lo da la posición; la restricción única pasa a ser diferible | Conserva los `id` de los requisitos que usará la 004 (`tramites.documento.requisito_id`) y permite reordenar dentro de una transacción (research §R-04) |
| TTL de Redis de 240 s | Además, la configuración rechaza un valor mayor que 240 y se corrige el texto de ADR-005 en el documento 07 | Así el límite de 5 minutos no depende de que alguien configure bien la variable. La Gobernanza pide corregir el documento cuando cambia (research §R-06) |
| Motivo de "no determinada" mostrado al visitante | El portal muestra el mismo mensaje para cualquier motivo, y se ajustó el escenario 7 de la historia 1 | Explicar el motivo de "No lo sé" exigiría escribir un valor de opción en el código, y eso lo prohíbe FR-002 (research §R-01) |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5.x con `"strict": true`, sobre Node.js 24 LTS (igual que en la 001
y la 002).

**Dependencias principales**: las mismas de la 002 (NestJS 11, Prisma 6 con `multiSchema`,
ioredis 5, zod, React 19 + Vite, react-router 7, openapi-fetch). No se agrega ninguna dependencia
de ejecución. Para la prueba de carga se usa k6 con la imagen de Docker `grafana/k6` fijada a una
versión concreta.

**Almacenamiento**: PostgreSQL 16, esquema `catalogo`, con la migración `0004` (tabla
`cambio_receta`, la restricción de `requisito` diferible y la opción `NO_SE`). Redis 7 guarda la
caché de la lista, de cada ficha y del asistente.

**Pruebas**:
- Jest para las pruebas unitarias del dominio y de la aplicación: tabla de las 30 combinaciones,
  validaciones de `RecetaCompleta`, la coherencia con la ruta comparada con la semilla, el cálculo
  de diferencias y los casos de uso con dobles de los puertos.
- Supertest + Ajv contra `openapi.yaml` para las pruebas de integración: endpoints públicos, matriz
  401/403 de administración, atomicidad del registro, invalidación y peor caso de la caché, y dos
  guardados simultáneos.
- `esquema-equivalente`, ahora también con datos.
- jsdom + Testing Library para el portal.
- k6 y Lighthouse para las auditorías.

**Plataforma objetivo**: contenedores Linux (Docker Compose en desarrollo y CI) y navegadores
móviles desde 360 px de ancho.

**Tipo de proyecto**: aplicación web, en el monorepo de la 001 (`apps/api`, `apps/web`,
`packages/contracts`).

**Metas de rendimiento**: EQ-01, con 1,000 usuarios simultáneos, el 95 % de las respuestas en 2 s o
menos y menos de 1 % de errores 5xx. En el caso normal, la lista, la ficha y las preguntas se
responden desde Redis sin consultar PostgreSQL, y la propuesta hace dos lecturas en caché. Las
cabeceras `max-age=60` permiten que el navegador y el CDN absorban las repeticiones.

**Restricciones**:
- Cero montos o textos del catálogo escritos en el código (FR-002, FR-012).
- Propagación de un cambio en 5 minutos como máximo (FR-024).
- Ningún dato personal en el registro de cambios, en los registros de la aplicación ni en los
  errores (FR-026).
- Las respuestas del asistente no se guardan (FR-009).

**Escala y alcance**: 12 recetas, unas 60 filas de requisitos, 3 preguntas y 9 reglas; pocos
administradores. El módulo tiene 6 casos de uso, 7 operaciones HTTP (2 nuevas y 5 modificadas), 4
pantallas del portal y 1 script de carga.

## Verificación constitucional

*Puerta: debe pasar antes de la fase 0 y revisarse después de la fase 1.*

| Principio / puerta | Cómo lo cumple este plan | Estado |
|---|---|---|
| **I. Monolito modular con Clean Architecture** | Todo vive en `modulos/catalogo/{dominio,aplicacion,infraestructura,presentacion}`. El motor de reglas, las validaciones y el cálculo de diferencias son funciones puras del dominio, sin npm ni `node:*`. La transacción, la invalidación y el reloj quedan detrás de puertos. Del módulo de seguridad solo se usa `fachada.ts` (`RequiereRoles`, `UsuarioActual`). Sin cambios en `.dependency-cruiser.cjs`. | ✅ |
| **II. Contrato primero** | `openapi.yaml` cambia primero ([detalle](./contracts/openapi-cambios.md)). Los tipos del portal se regeneran, las pruebas de integración validan cada respuesta con Ajv y CI ejecuta `redocly lint`. | ✅ |
| **III. Modelo de datos por módulo** | Solo se toca el esquema `catalogo`, con la migración versionada `0004`. `docs/05-modelo-de-datos/` se actualiza en el mismo PR. `cambio_receta.usuario_id` no tiene FK hacia `seguridad` (MD2). La equivalencia entre los documentos y las migraciones, también de datos, la verifica una prueba (research §R-08). No hay datos personales nuevos. | ✅ |
| **IV. TypeScript estricto y lenguaje del dominio** | `strict` y sin `any`. Los nombres están en español: `RecetaCompleta`, `Requisito`, `CambiosReceta`, `DiferenciaReceta`, `PreguntaAsistente`, `ReglaAsistente`, `proponerLicencia`, `aplicarCambios`, `COHERENCIA_POR_RUTA`, `ObtenerPreguntas`, `ProponerLicencia`, `ObtenerFicha`, `ListarRecetasAdmin`, `ObtenerRecetaAdmin`, `ActualizarReceta`, `UnidadDeTrabajoCatalogo` e `InvalidadorCacheCatalogo`. | ✅ |
| **V. Toda tarea incluye su prueba** | Prueba unitaria de cada regla y de cada caso de uso, y de integración de cada endpoint. El umbral de cobertura es 80 % en `catalogo/dominio` y `catalogo/aplicacion`. | ✅ |
| **VI. Escenarios de calidad** | **EQ-01:** caché y cabeceras HTTP; script de k6 con umbrales p95 < 2 s y errores < 1 %, a escala reducida en local y a 1,000 usuarios en el entorno desplegado (research §R-10). **EQ-05:** Lighthouse ≥ 90 en accesibilidad y en buenas prácticas en 4 vistas, sin desplazamiento horizontal a 360 px. **EQ-06:** cambiar una tasa no toca código (prueba de integración); el límite de 5 minutos se prueba; dependency-cruiser sigue en verde. | ✅ |
| **VII. Protección de datos personales** | El asistente no recibe datos personales. Las respuestas que van en la URL del portal no son datos personales. El registro y los logs usan solo `usuarioId`. El cambio y su registro se guardan en la misma transacción. Se reutilizan la protección por rol y la invalidación inmediata de la 002. | ✅ |
| **VIII. Flujo Git disciplinado** | Rama `003-catalogo-asistente`, commits convencionales y PR con los 5 checks en verde. | ✅ |
| **Puertas de CI (5)** | Las mismas que antes. `esquema-equivalente` compara también datos y `migraciones.spec` congela `0002`. No hacen falta variables nuevas en el workflow, porque `CATALOGO_CACHE_TTL_SEGUNDOS` ya tiene un valor por defecto. | ✅ |

**Módulos afectados**:
- `catalogo`, en sus 4 capas.
- `compartido`, solo la validación de `CATALOGO_CACHE_TTL_SEGUNDOS`.
- `seguridad` no cambia: solo se usa su fachada.

**Cambios en el contrato OpenAPI**: 2 operaciones nuevas, 5 modificadas, 3 esquemas nuevos y 1
modificado ([detalle](./contracts/openapi-cambios.md)).

**Cambios en el modelo de datos**: la tabla `catalogo.cambio_receta`, la restricción
`requisito (codigo_receta, orden)` diferible y la opción `NO_SE` ([detalle](./data-model.md)).

**Datos personales**: ninguno nuevo. Del administrador solo se guarda el identificador interno.

**Resultado de la puerta (antes de la fase 0)**: aprobada. Las cuatro diferencias con la entrada se
resolvieron a favor de la constitución (ver la tabla del resumen) y no hay excepciones que
justificar.

**Revisión después de la fase 1**: aprobada. [data-model.md](./data-model.md) y
[contracts/](./contracts/) no introducen violaciones.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/003-catalogo-asistente/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas (R-01 a R-12)
├── data-model.md        # Fase 1: migración 0004, entidades, coherencia por ruta, puertos
├── quickstart.md        # Fase 1: guía de validación de punta a punta
├── contracts/
│   ├── openapi-cambios.md
│   ├── asistente.md
│   ├── catalogo-admin.md
│   └── portal-catalogo.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (lo crea /speckit-tasks, no este comando)
```

### Código fuente (raíz del repositorio)

```text
docs/
├── 01-analisis-de-sistema/07-decisiones-arquitectonicas.md  # ADR-005: 5 min = Redis 240 s + navegador 60 s
├── 05-modelo-de-datos/
│   ├── esquema.sql                  # cambio_receta y restricción diferible
│   ├── datos-semilla.sql            # opción NO_SE (estado actual)
│   └── modelo-entidad-relacion.md   # diagrama y diccionario de catalogo
└── 06-contrato-api/
    ├── openapi.yaml                 # contracts/openapi-cambios.md
    └── README.md

.env.example                         # CATALOGO_CACHE_TTL_SEGUNDOS=240
infra/docker-compose.yml             # valor por defecto 240
README.md                            # asistente, edición del catálogo, tiempo de propagación, k6
tests/carga/eq01-catalogo.js         # k6 (EQ-01)

apps/api/
├── prisma/
│   ├── schema.prisma                # regenerado con db pull después de 0004
│   └── migrations/0004_catalogo_asistente/migration.sql
├── src/
│   ├── compartido/infraestructura/configuracion.ts   # TTL por defecto 240, máximo 240
│   └── modulos/catalogo/
│       ├── dominio/                 # receta-completa.ts, requisito.ts, coherencia-ruta.ts,
│       │                            # diferencia-receta.ts, motor-reglas-asistente.ts,
│       │                            # pregunta-asistente.ts, errores; puertos
│       │                            # repositorio-catalogo.ts (ampliado), unidad-de-trabajo-catalogo.ts,
│       │                            # invalidador-cache-catalogo.ts, reloj.ts
│       ├── aplicacion/              # obtener-preguntas.ts, proponer-licencia.ts, obtener-ficha.ts,
│       │                            # listar-recetas-admin.ts, obtener-receta-admin.ts,
│       │                            # actualizar-receta.ts (listar-recetas.ts ya existe)
│       ├── infraestructura/         # repositorio-catalogo-postgres.ts (ampliado),
│       │                            # repositorio-catalogo-con-cache.ts (claves nuevas),
│       │                            # unidad-de-trabajo-catalogo-postgres.ts,
│       │                            # invalidador-cache-catalogo-redis.ts, reloj-sistema.ts
│       ├── presentacion/            # catalogo.controller.ts (ficha), asistente.controller.ts,
│       │                            # catalogo-admin.controller.ts (GET admin + PUT), esquemas zod
│       ├── catalogo.module.ts       # cableado con useFactory
│       └── fachada.ts               # sin cambios de forma
└── test/
    ├── unit/modulos/catalogo/       # motor (30 combinaciones), receta, coherencia vs. semilla,
    │                                # diferencias, casos de uso
    ├── unit/migraciones.spec.ts     # 0001 y 0002 congeladas con SHA-256
    └── integracion/
        ├── catalogo.e2e-spec.ts               # lista (max-age=60) y ficha (404 si está desactivada)
        ├── asistente.e2e-spec.ts              # preguntas, propuesta, 422
        ├── catalogo-admin.e2e-spec.ts         # edición, 422, registro, sin cambios, reorden por id
        ├── matriz-permisos-catalogo.e2e-spec.ts
        ├── cache-catalogo.e2e-spec.ts         # invalidación y peor caso sin Redis
        ├── guardado-concurrente-receta.e2e-spec.ts
        └── esquema-equivalente.e2e-spec.ts    # también los datos del catálogo

apps/web/src/
├── Aplicacion.tsx                   # rutas nuevas
├── servicios/clienteApi.ts          # preguntas, proponer, ficha, admin, actualizar
├── componentes/                     # FichaLicencia (+ test), TarjetaLicencia con enlace, Menu "Catálogo"
└── paginas/
    ├── Asistente.tsx                # (+ .test.tsx)
    ├── Licencia.tsx                 # (+ .test.tsx)
    ├── Inicio.tsx                   # botón "¿Qué licencia necesito?"
    └── admin/
        ├── Catalogo.tsx             # (+ .test.tsx)
        └── EditarReceta.tsx         # (+ .test.tsx)
```

**Decisión de estructura**: la misma de la 001 y la 002. El módulo `catalogo` ya existe y crece en
sus cuatro capas. Hay un controlador por grupo de rutas: público del catálogo, asistente y
administración. El script de carga va en `tests/carga/`, en la raíz, porque prueba el sistema
completo y no pertenece a ninguna aplicación.

## Seguimiento de complejidad

No hay violaciones de la constitución que justificar.
