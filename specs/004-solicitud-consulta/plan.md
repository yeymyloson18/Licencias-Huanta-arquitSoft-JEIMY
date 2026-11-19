# Plan de implementación: Presentar solicitud y consultar el estado del trámite

**Rama**: `004-solicitud-consulta` | **Fecha**: 2026-11-18 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación `specs/004-solicitud-consulta/spec.md` (con 5 aclaraciones del
2026-11-18) y el plan técnico `docs/sdd/004-solicitud-plan.md`.

## Resumen

Se construye el módulo `tramites`, hasta ahora vacío, y se amplía `seguridad` con la identidad del
administrado. Incluye cinco piezas:

- **Identidad en línea** (`seguridad`): RUC + DNI con fecha de emisión (o carné de extranjería) y,
  si actúa, el representante, comprobados con un servicio de identificación detrás de un puerto (hoy
  simulado); código de 6 dígitos al celular y un `tokenIdentidad` de 15 minutos y un solo uso. Los
  límites de intentos y el envío del código reutilizan la 002.
- **Documentos**: subida previa de PDF, JPG o PNG de hasta 10 MB, con el tipo comprobado por el
  contenido y huella SHA-256; los abandonados se descartan a las 24 horas.
- **Presentación** (en línea y en mesa de partes): formulario que pide solo los requisitos de la
  receta; en una transacción se crea el expediente REGISTRADO con número `EXP-AAAA-NNNNNN`, la ruta
  de la receta, la copia de la receta al presentar, el historial, la auditoría y el evento
  `SolicitudPresentada`. La clave de idempotencia evita duplicados.
- **Consulta pública** del estado con número + DNI/CE/RUC, mensaje único si no coinciden y bloqueo
  por origen tras 5 fallos en 15 minutos.
- **Bandeja y detalle** para mesa de partes, evaluador y jefatura.

En el portal hay 7 pantallas pensadas primero para el celular y un segundo script de k6 para la
consulta (EQ-01).

**Primero el contrato y el modelo** (principios II y III), en el mismo PR y antes del código:

1. `docs/06-contrato-api/openapi.yaml` y su README, según
   [contracts/openapi-cambios.md](./contracts/openapi-cambios.md).
2. La migración `0006_solicitud_consulta` y la actualización de `docs/05-modelo-de-datos/`, según
   [data-model.md](./data-model.md).

**Dónde este plan se aparta de la entrada** (la constitución prevalece y la entrada no lo prevé):

| Entrada | Plan | Motivo |
|---|---|---|
| La fachada de seguridad "gasta el `tokenIdentidad` de forma atómica" | El uso único lo garantiza `tramites.expediente.verificacion_id` con índice único, en la misma transacción que crea el expediente | `tramites` no escribe en el esquema de `seguridad` (principio III) y no hay dos transacciones que coordinar (research §R-04) |
| La fachada "expone la identidad confirmada" | El portal reenvía la identidad y la fachada compara sus huellas HMAC con las de la verificación; el campo `identidadPresencial` del contrato pasa a llamarse `identidad` y se usa en los dos canales | `seguridad` no guarda una copia cifrada de los datos personales solo para entregarlos después (principio VII, research §R-05) |
| Secuencia nueva `tramites.secuencia_expediente` | Se reutiliza `tramites.numero_expediente_seq`, que ya existe en `esquema.sql` | Mismo fin; evita dos secuencias (research §R-10) |
| Tarea programada con `comun.ejecucion_tarea` para descartar archivos | Tarea cada hora con `pg_try_advisory_lock`; además, un documento de más de 24 h no se acepta al presentar | `ejecucion_tarea` registra una ejecución por día y un archivo podría vivir 48 h (research §R-09) |
| Descarga de documentos por URL firmada (contrato inicial) | La API entrega el archivo (200, `attachment`, `nosniff`) | El almacén es un disco local hasta la 010; una URL firmada necesita S3 (research §R-13) |
| Pregunta pendiente sobre el representante (segunda sesión de aclaración, sin respuesta) | El representante también se valida con el servicio | Lo piden RF06 y ADR-007 (research §R-01) |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5.x con `"strict": true`, sobre Node.js 24 LTS (igual que en la 001
a la 003).

**Dependencias principales**: las mismas de la 003 (NestJS 11 con `@nestjs/platform-express`, que ya
trae Multer; `@nestjs/jwt`; Prisma 6 con `multiSchema`; ioredis 5; zod; React 19 + Vite;
react-router 7; openapi-fetch). Solo se agrega `@types/multer` como dependencia de desarrollo. No se
agrega ninguna dependencia de ejecución: la detección del tipo de archivo, la huella y la tarea
periódica usan `node:crypto` y temporizadores (research §R-08 y §R-09).

**Almacenamiento**:
- PostgreSQL 16, esquemas `tramites` (expediente ampliado, `documento_temporal`,
  `clave_idempotencia`, auditoría ampliada) y `seguridad` (`verificacion_identidad` ampliada), con la
  migración `0006`.
- Redis 7 para los límites de intentos (identidad y consulta).
- Archivos en un volumen de Docker (`ALMACEN_ARCHIVOS_RUTA`) detrás del puerto `AlmacenArchivos`.

**Pruebas**:
- Jest para el dominio y la aplicación: política de requisitos de las 9 licencias contra
  `datos-semilla.sql`, `NumeroExpediente`, detección del tipo de archivo, textos públicos de cada
  estado, agregado `Expediente` y casos de uso con dobles de los puertos.
- Supertest + Ajv contra `openapi.yaml` para la integración: flujo en línea y presencial, 10 envíos
  en paralelo con la misma clave, permiso usado y vencido, matriz 401/403, fuerza bruta (429),
  servicio `NO_DISPONIBLE` (503), archivos renombrados y grandes, atomicidad con un fallo forzado y
  privacidad con el logger capturador de la 002.
- `esquema-equivalente` con la migración `0006`.
- jsdom + Testing Library para el portal.
- k6 y Lighthouse para las auditorías.

**Plataforma objetivo**: contenedores Linux (Docker Compose en desarrollo y CI) y navegadores
móviles desde 360 px de ancho.

**Tipo de proyecto**: aplicación web, en el monorepo de la 001 (`apps/api`, `apps/web`,
`packages/contracts`).

**Metas de rendimiento**: EQ-01 para la consulta del estado: con 1,000 usuarios simultáneos, el 95 %
en 2 s o menos y menos de 1 % de errores. La consulta hace una lectura por índice
(`numero`, `documento_hmac`) y una del historial; no se guarda en caché compartida porque tiene datos
del titular (research §R-12).

**Restricciones**:
- Ningún dato personal en URL, registros, errores, eventos ni auditoría (FR-035, principio VII).
- Sin identidad confirmada no se presenta en línea; el servicio caído no abre la puerta (FR-005).
- Una solicitud, un expediente, aunque se envíe varias veces (FR-020).
- El expediente conserva la receta con la que se presentó (FR-017).

**Escala y alcance**: miles de expedientes al año, con picos de pocas decenas por hora; 9 licencias
presentables; 3 roles en la bandeja. El trabajo suma 2 operaciones nuevas de identidad, 6 de
trámites (todas ya declaradas en el contrato y ajustadas), unos 9 casos de uso, 7 pantallas y 1
script de carga.

## Verificación constitucional

*Puerta: debe pasar antes de la fase 0 y revisarse después de la fase 1.*

| Principio / puerta | Cómo lo cumple este plan | Estado |
|---|---|---|
| **I. Monolito modular con Clean Architecture** | `tramites` en sus cuatro capas; la política de requisitos, el número, la detección del tipo de archivo y los textos públicos son funciones puras del dominio. Transacción, almacén, limitador, reloj y huella detrás de puertos. `tramites` usa `catalogo` y `seguridad` solo por sus fachadas (`obtenerRecetaVigente`, `confirmarIdentidadEnLinea`, `verificarIdentidadPresencial`, `RequiereRoles`, `UsuarioActual`). El protector de datos pasa a `compartido` en lugar de importarse desde `seguridad` (research §R-06). | ✅ |
| **II. Contrato primero** | `openapi.yaml` y su README cambian primero ([detalle](./contracts/openapi-cambios.md)); se regeneran los tipos; Ajv valida cada respuesta de integración y CI corre `redocly lint`. | ✅ |
| **III. Modelo de datos por módulo** | Cada módulo escribe solo su esquema: `tramites` (expediente, documentos, idempotencia, auditoría) y `seguridad` (verificación). Las referencias entre módulos son lógicas, sin FK (MD2). Migración versionada `0006` y `docs/05-modelo-de-datos/` en el mismo PR, verificados por `esquema-equivalente`. | ✅ |
| **IV. TypeScript estricto y lenguaje del dominio** | `strict`, sin `any`; nombres en español: `Expediente`, `NumeroExpediente`, `RecetaAlPresentar`, `clasificarRequisitos`, `detectarTipoArchivo`, `TEXTO_ESTADO_PUBLICO`, `SubirDocumento`, `PresentarSolicitud`, `ConsultarEstado`, `ListarExpedientes`, `ObtenerDetalleExpediente`, `ServicioIdentificacion`, `AlmacenArchivos`, `LimitadorConsultas`, `UnidadDeTrabajoTramites`. | ✅ |
| **V. Toda tarea incluye su prueba** | Prueba unitaria de cada regla y caso de uso y de integración de cada endpoint; cobertura ≥ 80 % en `tramites/dominio` y `tramites/aplicacion` (y se mantiene en `seguridad`). | ✅ |
| **VI. Escenarios de calidad** | **EQ-01:** k6 `eq01-consulta.js` con 100 y 1,000 usuarios. **EQ-04:** matriz 401/403 de cada endpoint nuevo, presentación sin identidad, consulta con DNI ajeno, fuerza bruta (bloqueo en el 6.º intento), privacidad de registros y errores, ZAP sobre las pantallas nuevas. **EQ-05:** recorrido cronometrado ≤ 15 min y Lighthouse ≥ 90 en 4 vistas, sin desplazamiento horizontal a 360 px. | ✅ |
| **VII. Protección de datos personales** | Documento, RUC, celular, correo, dirección y representante cifrados con AES-256-GCM y HMAC para buscar; nunca en URL (la consulta es POST), registros ni errores; la consulta muestra datos mínimos; consulta solo con número **y** documento y límite de 5 fallos en 15 min; auditoría en la misma transacción. `seguridad` guarda solo huellas. | ✅ |
| **VIII. Flujo Git disciplinado** | Rama `004-solicitud-consulta`, commits convencionales y PR con los 5 checks en verde. | ✅ |
| **Puertas de CI (5)** | Las mismas. El workflow necesita `ALMACEN_ARCHIVOS_RUTA` con un valor por defecto en la configuración (carpeta temporal en pruebas), así que no hace falta cambiarlo. | ✅ |

**Módulos afectados**:
- `tramites`, en sus 4 capas (nuevo).
- `seguridad`: identidad del administrado, puerto `ServicioIdentificacion` y su simulado, límites de
  intentos ampliados y fachada ampliada.
- `catalogo`: solo su fachada (`obtenerRecetaVigente`).
- `compartido`: el protector de datos y la configuración del almacén.

**Cambios en el contrato OpenAPI**: 8 operaciones ajustadas, 1 parámetro nuevo y 3 esquemas
modificados ([detalle](./contracts/openapi-cambios.md)).

**Cambios en el modelo de datos**: `tramites.expediente` (receta al presentar, verificación,
representante y restricciones), `documento_temporal`, `clave_idempotencia`, `documento` y
`auditoria` ampliados, y `seguridad.verificacion_identidad` con la huella del representante
([detalle](./data-model.md)).

**Datos personales**: los del titular y el representante en `tramites.expediente`, cifrados; en
`seguridad`, solo huellas.

**Resultado de la puerta (antes de la fase 0)**: aprobada. Las seis diferencias con la entrada se
resolvieron a favor de la constitución (tabla del resumen) y no hay excepciones que justificar.

**Revisión después de la fase 1**: aprobada. [data-model.md](./data-model.md) y
[contracts/](./contracts/) no introducen violaciones.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/004-solicitud-consulta/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas (R-01 a R-15)
├── data-model.md        # Fase 1: migración 0006, entidades, estados, datos personales
├── quickstart.md        # Fase 1: guía de validación y datos del servicio simulado
├── contracts/
│   ├── openapi-cambios.md
│   ├── identidad-y-solicitud.md
│   ├── consulta-y-bandeja.md
│   └── portal-tramite.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (lo crea /speckit-tasks, no este comando)
```

### Código fuente (raíz del repositorio)

```text
docs/
├── 01-analisis-de-sistema/07-decisiones-arquitectonicas.md  # ADR-007: tokenIdentidad de un solo uso
├── 03-diseno-de-software/diagrama-casos-de-uso.md           # CU03, CU04, CU06 y CU12 a "Hecho" al terminar
├── 05-modelo-de-datos/
│   ├── esquema.sql                  # estado después de 0006
│   └── modelo-entidad-relacion.md   # tramites y verificacion_identidad
└── 06-contrato-api/
    ├── openapi.yaml                 # contracts/openapi-cambios.md
    └── README.md                    # matriz de permisos

.env.example, infra/docker-compose.yml   # ALMACEN_ARCHIVOS_RUTA y volumen de archivos
apps/web/nginx.conf                       # client_max_body_size 11m
README.md                                 # funcionalidad 004 y datos ficticios del simulado
tests/carga/eq01-consulta.js              # k6 (EQ-01)

apps/api/
├── prisma/
│   ├── schema.prisma                # regenerado después de 0006
│   └── migrations/0006_solicitud_consulta/migration.sql
├── src/
│   ├── compartido/
│   │   ├── dominio/protector-datos.ts                 # movido desde seguridad
│   │   └── infraestructura/protector-datos-aes-gcm.ts # movido desde seguridad, sin cambios
│   └── modulos/
│       ├── seguridad/
│       │   ├── dominio/puertos/servicio-identificacion.ts, limitador-intentos.ts (ampliado)
│       │   ├── aplicacion/verificar-identidad-administrado.ts, verificar-otp-administrado.ts,
│       │   │              confirmar-identidad-en-linea.ts, verificar-identidad-presencial.ts
│       │   ├── infraestructura/servicio-identificacion-simulado.ts,
│       │   │                   repositorio-verificaciones-postgres.ts, emisor-tokens-jwt.ts (audiencia nueva)
│       │   ├── presentacion/identidad.controller.ts
│       │   └── fachada.ts            # + confirmarIdentidadEnLinea, verificarIdentidadPresencial
│       ├── catalogo/fachada.ts       # + obtenerRecetaVigente
│       └── tramites/
│           ├── dominio/              # numero-expediente.ts, expediente.ts, receta-al-presentar.ts,
│           │                         # politica-requisitos.ts, establecimiento.ts, tipo-archivo.ts,
│           │                         # estado-publico.ts, errores; puertos: repositorio-expedientes,
│           │                         # unidad-de-trabajo-tramites, almacen-archivos, limitador-consultas,
│           │                         # calculador-huella, reloj
│           ├── aplicacion/           # subir-documento.ts, presentar-solicitud.ts, consultar-estado.ts,
│           │                         # listar-expedientes.ts, obtener-detalle-expediente.ts,
│           │                         # descargar-documento.ts, descartar-documentos-vencidos.ts
│           ├── infraestructura/      # repositorio-expedientes-postgres.ts,
│           │                         # unidad-de-trabajo-tramites-postgres.ts, almacen-archivos-disco.ts,
│           │                         # limitador-consultas-redis.ts, huella-sha256.ts,
│           │                         # tarea-descarte-documentos.ts
│           ├── presentacion/         # documentos.controller.ts, expedientes.controller.ts,
│           │                         # consulta.controller.ts, esquemas zod
│           ├── tramites.module.ts
│           └── fachada.ts            # vacía por ahora (la usarán 005 y 006)
└── test/
    ├── unit/modulos/tramites/        # política (9 licencias), número, tipo de archivo, estados, casos de uso
    ├── unit/modulos/seguridad/       # identidad del administrado y limitador ampliado
    └── integracion/
        ├── identidad-administrado.e2e-spec.ts   # 200/422/503/429, código, token
        ├── documentos.e2e-spec.ts               # 201/413/415, uso solo por quien lo subió
        ├── presentar-solicitud.e2e-spec.ts      # en línea, presencial, 409, 422, atomicidad
        ├── idempotencia-expediente.e2e-spec.ts  # 10 envíos en paralelo
        ├── consulta-estado.e2e-spec.ts          # 200/404 único/429
        ├── bandeja-expedientes.e2e-spec.ts      # filtros, detalle, descarga, auditoría
        ├── matriz-permisos-tramites.e2e-spec.ts # 401/403 de cada endpoint nuevo
        ├── privacidad-tramites.e2e-spec.ts      # registros y errores sin datos personales
        └── esquema-equivalente.e2e-spec.ts      # con 0006

apps/web/src/
├── Aplicacion.tsx                   # rutas nuevas
├── servicios/clienteApi.ts          # identidad, documentos, presentar, consultar, bandeja
├── tramite/ContextoTramite.tsx      # token e identidad en memoria
├── componentes/                     # FichaLicencia con "Presentar solicitud", Menu (Expedientes, Registrar)
└── paginas/
    ├── tramite/Identidad.tsx, Solicitud.tsx, Comprobante.tsx   # (+ .test.tsx)
    ├── Consulta.tsx                                          # (+ .test.tsx)
    └── personal/Expedientes.tsx, DetalleExpediente.tsx, MesaPartes.tsx   # (+ .test.tsx)
```

**Decisión de estructura**: la misma de la 001 a la 003. El formulario de solicitud es un componente
que comparten la pantalla en línea y la de mesa de partes; cambia solo la identidad (con código o
presencial). El script de carga va en `tests/carga/`, junto al de la 003.

## Seguimiento de complejidad

No hay violaciones de la constitución que justificar.
