# Plan de implementación: Inspección ITSE, licencia con QR, plazos en días hábiles y avisos

**Rama**: `006-itse-licencia-plazos` | **Fecha**: 2026-11-20 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación (con las aclaraciones del 2026-11-20) y la sección "Cómo construirlo" de
`docs/sdd/006-itse-licencia-plazos.md`.

## Resumen

Se completan cuatro módulos que hoy están vacíos y se amplía `tramites`:

- **`plazos`**: `CalendarioHabil` (dominio puro), feriados (CRUD de administrador y semilla de 2026),
  reloj de plazos con candado de una sola ejecución, alertas para la jefatura y `FachadaPlazos` para
  sumar días hábiles.
- **`inspecciones`**: inspección creada desde `InspeccionRequerida`, asignación por la jefatura,
  registro del resultado con fotos por el inspector asignado (una sola vez) y auditoría.
- **`licencias`**: emisión desde `LicenciaSolicitada` (una vigente por expediente), certificado ITSE,
  PDF con QR, verificación pública con límite de intentos y aviso del ITSE por vencer.
- **`notificaciones`**: avisos desde `EstadoExpedienteCambiado` e `ItsePorVencer`, envío por un puerto
  con adaptador simulado y reintentos.
- **`tramites`**: transiciones nuevas por ruta, consumidores de `LicenciaEmitida` y
  `ResultadoITSERegistrado`, vencimiento al presentar, suspensión del plazo, plazo para subsanar y
  fachada ampliada (datos para la licencia, contacto, dirección, expedientes con plazo).

Piezas compartidas: el despachador pasa el id del evento al manejador (research §R-02) y la detección
de tipo de archivo y el almacén en disco pasan de `tramites` a `compartido` (research §R-13). En el
portal: inspecciones (jefatura e inspector con la cámara), alertas, feriados, verificación pública y
"Descargar licencia".

**Primero el contrato y el modelo** (principios II y III): `openapi.yaml` según
[contracts/openapi-cambios.md](./contracts/openapi-cambios.md), y la migración
`0010_itse_licencia_plazos` con `docs/05-modelo-de-datos/` según [data-model.md](./data-model.md).

**Dónde este plan se aparta de la entrada** (la constitución prevalece):

| Entrada | Plan | Motivo |
| --- | --- | --- |
| Hasta 5 fotos; el contrato decía 10 | 1 a 5 (se ajusta el contrato) | La entrada es explícita |
| Observaciones sin largo | Hasta 4000, como el contrato | No cambiar el contrato sin motivo |
| Texto de observaciones en los eventos | Los eventos llevan el id de la inspección; `tramites` lee el texto por la fachada | Eventos sin texto libre (principio VII) |
| Plazo para subsanar "verificar con el TUPA" | 2 días hábiles (TUO de la Ley N.° 27444, 136.2) | docs/01 no fija otro (research §R-05) |
| Plazo solo suspendido en la observación | También en PENDIENTE_PAGO | Aclaración del 2026-11-20 |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5.x estricto sobre Node.js 24 (igual que la 001 a la 005).

**Dependencias**: las de la 005. Se agrega **una** dependencia de ejecución, `qrcode-generator`, para el
QR (research §R-09); el PDF sigue con `pdf-lib`.

**Almacenamiento**: PostgreSQL 16 (esquemas `tramites`, `inspecciones`, `licencias`, `plazos`,
`notificaciones` y `comun`); Redis para el límite de verificaciones y los avisos simulados; disco
compartido para las fotos (el mismo volumen de los documentos de la 004).

**Pruebas**: Jest (unitarias de dominio y casos de uso), Supertest con validación contra el contrato
(integración, PostgreSQL temporal en 5433 y Redis en 16379), Jest + Testing Library (portal).

**Plataforma**: API NestJS sin estado detrás del nginx del portal; el reloj y el enviador de avisos usan
candados de PostgreSQL para admitir varias réplicas.

**Tipo de proyecto**: monorepo web (API + portal + contrato).

**Metas de desempeño**: verificación pública en 2 s o menos (SC-006); cada paso automático del
recorrido en segundos (el despachador corre cada 2 s).

**Restricciones**: un esquema por módulo, sin FK entre esquemas; ningún dato personal en registros,
URL, eventos, avisos, auditoría ni PDF; cobertura ≥ 80 % por archivo en `dominio` y `aplicacion`.

**Escala**: la de la 004 (cientos de expedientes por mes, decenas de inspecciones por semana).

## Verificación constitucional

| Principio | Cumplimiento |
| --- | --- |
| I. Monolito modular y Clean Architecture | Los módulos se hablan por fachadas (`FachadaPlazos`, `FachadaTramites`, `FachadaInspecciones`, `FachadaLicencias`, `FachadaSeguridad`) y por eventos; el dominio no importa NestJS ni Prisma; dependency-cruiser lo verifica |
| II. Contrato primero | `openapi.yaml` se cambia en la fase 2, antes de los controladores |
| III. Modelo por módulo | 0010 toca cada esquema solo para su dueño; solo `tramites` cambia el estado del expediente |
| IV. TypeScript estricto y español | `CalendarioHabil`, `Inspeccion`, `Licencia`, `RelojPlazos`, `LicenciaEmitida` |
| V. Pruebas | Unitarias por regla y caso de uso; integración por endpoint y por los recorridos A, B y C |
| VI. Escenarios de calidad | EQ-07 (reloj con 2 réplicas, alertas sin duplicar), EQ-04 (matriz 401/403, auditoría, privacidad), SC-001 y SC-002 con un recorrido en el navegador a 360 px en un clon aislado. k6, Lighthouse y ZAP en el despliegue (007), como decidió la usuaria |
| VII. Datos personales | Dirección solo para el inspector asignado; destinatario de avisos cifrado; titular público sin documento; prueba de privacidad |
| VIII. Git | Rama `006-itse-licencia-plazos`, commit por fase, sin push (lo hace la usuaria) |

Resultado: sin violaciones. Se repite tras el diseño: sin cambios.

## Estructura del proyecto

### Documentación

```text
specs/006-itse-licencia-plazos/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/openapi-cambios.md
├── contracts/portal-006.md
└── tasks.md (lo crea /speckit-tasks)
```

### Código fuente

```text
apps/api/
├── prisma/migrations/0010_itse_licencia_plazos/migration.sql
├── src/compartido/dominio/tipo-archivo.ts                       # movido desde tramites (research §R-13)
├── src/compartido/infraestructura/almacen-archivos-disco.ts     # movido desde tramites
├── src/compartido/infraestructura/despachador-eventos.ts        # + id del evento (research §R-02)
├── src/modulos/seguridad/fachada.ts                             # + usuariosConRol
├── src/modulos/tramites/
│   ├── dominio/maquina-estados.ts                               # + transiciones por ruta
│   ├── aplicacion/aplicar-licencia-emitida.ts, aplicar-resultado-itse.ts, plazo-expediente.ts,
│   │              completar-vencimientos.ts (+ cambios en presentar, observar, subsanar, confirmar
│   │              riesgo, aprobar y aplicar pago)
│   ├── infraestructura/plazos-fachada.ts, inspecciones-fachada.ts, manejadores-006.ts
│   └── fachada.ts                                               # + datosParaLicencia, contactoTitular,
│                                                                #   direccionDelLocal, expedientesConPlazo
├── src/modulos/plazos/
│   ├── dominio/calendario-habil.ts, feriado.ts, puertos/*
│   ├── aplicacion/feriados.ts, generar-alertas.ts, alertas.ts
│   ├── infraestructura/repositorio-feriados-postgres.ts, repositorio-alertas-postgres.ts, reloj-plazos.ts
│   ├── presentacion/feriados.controller.ts, alertas.controller.ts
│   └── fachada.ts, plazos.module.ts
├── src/modulos/inspecciones/
│   ├── dominio/inspeccion.ts, numero-certificado.ts, puertos/*
│   ├── aplicacion/crear-inspeccion.ts, asignar-inspector.ts, registrar-resultado.ts, listar-inspecciones.ts
│   ├── infraestructura/repositorio-inspecciones-postgres.ts, *-fachada.ts, manejador-inspeccion-requerida.ts
│   ├── presentacion/inspecciones.controller.ts
│   └── fachada.ts, inspecciones.module.ts
├── src/modulos/licencias/
│   ├── dominio/licencia.ts, titular-publico.ts, codigo-verificacion.ts, puertos/*
│   ├── aplicacion/emitir-licencia.ts, registrar-certificado.ts, verificar-licencia.ts,
│   │              obtener-licencia.ts, avisar-certificados-por-vencer.ts
│   ├── infraestructura/repositorio-licencias-postgres.ts, pdf-licencia-pdflib.ts, qr.ts,
│   │                   limitador-verificaciones-redis.ts, manejadores.ts, tramites-fachada.ts
│   ├── presentacion/licencias.controller.ts
│   └── fachada.ts, licencias.module.ts
└── src/modulos/notificaciones/
    ├── dominio/aviso.ts, plantillas.ts, puertos/enviador-mensajes.ts
    ├── aplicacion/crear-aviso.ts, enviar-avisos-pendientes.ts
    ├── infraestructura/repositorio-avisos-postgres.ts, enviador-simulado-redis.ts, enviador-avisos.ts
    └── notificaciones.module.ts

apps/web/src/
├── paginas/personal/Inspecciones.tsx, ResultadoInspeccion.tsx, Alertas.tsx
├── paginas/admin/Feriados.tsx
├── paginas/Verificar.tsx
├── paginas/Consulta.tsx, paginas/personal/DetalleExpediente.tsx  # + Descargar licencia
└── componentes/DescargarLicencia.tsx, Menu.tsx
```

## Seguimiento de complejidad

Ninguna violación que justificar. La única dependencia nueva (`qrcode-generator`, sin dependencias
propias) está justificada en research §R-09.
