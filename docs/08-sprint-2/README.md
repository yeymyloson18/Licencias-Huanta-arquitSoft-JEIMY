# Informe del Sprint 2: Sistema de Licencias de Funcionamiento de Huanta

Este informe resume lo construido en el Sprint 2 y dónde está la evidencia de cada actividad y
entregable que pide la guía del curso. Todo lo que se enlaza está en este repositorio. Las mediciones
pesadas (carga de 2,000 usuarios, Postman y planes de consulta con 10,000 expedientes) corren en
GitHub Actions y dejan sus resultados como archivos descargables (artefactos).

## 1. Actividades del Sprint 2

| N.° | Actividad de la guía | Qué se hizo | Evidencia |
| --- | --- | --- | --- |
| 1 | Implementar el estilo arquitectónico | Monolito modular: 9 módulos de negocio en un solo proceso y una base con un esquema por módulo (ADR-001) | [`apps/api/src/modulos/`](../../apps/api/src/modulos/), [base-de-datos.md](base-de-datos.md) §1 |
| 2 | Aplicar Clean Architecture | Cada módulo con dominio, aplicación, infraestructura y presentación; un módulo solo usa a otro por su fachada; regla verificada en cada PR | [solid-y-patrones.md](solid-y-patrones.md) §1, [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) |
| 3 | Especificaciones SDD con criterios de aceptación y tareas | Una carpeta por funcionalidad (001 a 008) con especificación, aclaraciones, plan, investigación, contratos, tareas y guía de validación | [`specs/`](../../specs/) |
| 4 | Endpoints REST documentados con OpenAPI/Swagger | Contrato único `openapi.yaml`; Swagger UI interactivo en `/api/docs` generado desde ese archivo; colección de Postman | [`docs/06-contrato-api/`](../06-contrato-api/), [`tests/postman/`](../../tests/postman/) |
| 5 | Analizar la base de datos y la caché | Esquemas, índices, planes de consulta con 10,000 expedientes, bloqueos y conexiones; claves de Redis, TTL, invalidación, fallos y medición | [base-de-datos.md](base-de-datos.md), [cache.md](cache.md) |
| 6 | Aplicar SOLID y patrones | Un ejemplo real por principio y 11 patrones con su archivo, verificados por un script | [solid-y-patrones.md](solid-y-patrones.md) |
| 7 | Pruebas automatizadas con Jest en CI/CD | 5 checks obligatorios en cada PR (compilación, pruebas, cobertura, regla de dependencia y contrato) más E2E, Postman y despliegue | [`.github/workflows/`](../../.github/workflows/) |
| 8 | Pruebas de los escenarios de calidad (hasta 2,000 usuarios) | k6 progresivo hasta 2,000 usuarios con 2 réplicas, Newman, matrices de permisos, privacidad, reloj con 2 instancias y Lighthouse | [atributos-de-calidad.md](atributos-de-calidad.md) |

## 2. Entregables

| Entregable | Dónde está |
| --- | --- |
| Código organizado según la arquitectura | [`apps/api/src/modulos/`](../../apps/api/src/modulos/) (9 módulos × 4 capas), [`apps/web/`](../../apps/web/) (portal) y [`packages/contracts/`](../../packages/contracts/) (tipos generados desde el contrato) |
| Primera versión funcional | Recorrido completo de una licencia (rutas A, B y C): asistente, identidad con código, solicitud, evaluación, pago en caja, inspección, licencia con QR, verificación pública, plazos, avisos y tablero. Se levanta con `docker compose -f infra/docker-compose.yml up -d --build` ([README principal](../../README.md)) |
| Documentación de la API con OpenAPI/Swagger | [`docs/06-contrato-api/openapi.yaml`](../06-contrato-api/openapi.yaml) y Swagger UI en `http://localhost:8080/api/docs/` |
| Pruebas con Jest y reporte de cobertura | §4 de este informe; artefacto `cobertura` del job del mismo nombre en cada ejecución del CI |
| Evidencias de los atributos de calidad | [atributos-de-calidad.md](atributos-de-calidad.md); artefactos `carga-sprint2`, `planes-bd` y `newman` |

## 3. Arquitectura en una página

- **Estilo**: monolito modular. Un solo despliegue y módulos separados por fachadas y eventos
  (ADR-001).
- **Enfoque**: Clean Architecture con puertos y adaptadores. El dominio no depende de NestJS, de la
  base ni de Redis (ADR-003).
- **Motor único y catálogo de recetas**: las 9 licencias del TUPA son datos editables, no código
  (ADR-002).
- **Tecnología**:

  | Pieza | Tecnología |
  | --- | --- |
  | API | NestJS sobre Node.js 24 con TypeScript estricto |
  | Base de datos | PostgreSQL 16 |
  | Caché y contadores de seguridad | Redis 7 |
  | Portal | React con Vite |
  | Ejecución | Docker Compose |

- **Los 9 módulos**:

  | Módulo | Qué hace |
  | --- | --- |
  | `seguridad` | Personal con OTP, roles y sesiones; identidad del administrado |
  | `catalogo` | Recetas del TUPA y asistente de ruta |
  | `tramites` | Expedientes, evaluación, estados y consulta pública |
  | `pagos` | Esquela y pago en caja |
  | `inspecciones` | ITSE con fotos |
  | `licencias` | Licencia con QR y verificación pública |
  | `plazos` | Feriados, días hábiles y alertas |
  | `notificaciones` | Avisos al administrado |
  | `reportes` | Tablero y reportes de la jefatura |

- **Comunicación entre módulos**:
  - síncrona, solo por `fachada.ts`;
  - asíncrona, con eventos en una cola de PostgreSQL (bandeja de salida, ADR-005).

## 4. Funcionalidades implementadas

| Funcionalidad | Historias de usuario | Qué permite |
| --- | --- | --- |
| 001 Esqueleto | — (criterios 3, 12 y 14) | Monorepo, Docker Compose, salud del sistema, CI con 5 checks y regla de dependencia |
| 002 Seguridad y usuarios | HU15 | Ingreso del personal con clave y código, roles, sesiones y gestión de usuarios |
| 003 Catálogo y asistente | HU01, HU03 y HU14 | Asistente de ruta, ficha de cada licencia y edición del TUPA sin código |
| 004 Solicitud y consulta | HU02 y HU05 | Identidad con código, solicitud con documentos, mesa de partes, bandeja y consulta pública |
| 005 Evaluación y pago | HU07, HU04, HU13 y HU17 | Evaluación, observación, esquela, pago en caja, corrección de recibo y auditoría |
| 006 ITSE, licencia y plazos | HU08, HU06, HU16, HU09 y HU11 | Inspección con fotos, licencia con QR, feriados, días hábiles, alertas y avisos |
| 007 Tablero y despliegue | HU10 | Tablero, reporte de licencias en CSV, E2E y producción preparada |
| 008 Cierre del Sprint 2 | — (entregables de la guía) | Swagger, Postman, cobertura publicada, carga hasta 2,000 usuarios y estos documentos |

## 5. Pruebas y cobertura

| Tipo | Cantidad | Dónde corre |
| --- | --- | --- |
| Unitarias de la API (Jest) | 1,107 | Job `pruebas` y `cobertura` del CI, y en local |
| Integración de la API (Jest + Supertest, PostgreSQL y Redis reales) | 580 en verde en la última ejecución local completa, más las nuevas de la 007 y la 008 que corren en el CI | Job `pruebas` del CI |
| Portal (Jest + Testing Library) | 303 | Job `pruebas` del CI y en local |
| Extremo a extremo (Playwright, celular y escritorio) | 2 recorridos × 2 tamaños | Flujo `E2E` |
| Humo de la API (Postman y Newman) | 13 peticiones | Flujo `Postman` |
| Carga (k6) | 387,235 peticiones hasta 2,000 usuarios: p95 6 ms, 0 % de errores | Flujo `Carga Sprint 2`, [`evidencias/carga-2000-despues.txt`](evidencias/carga-2000-despues.txt) |

**Cobertura** (pruebas unitarias; el reporte navegable está en el artefacto `cobertura` de cada
ejecución del CI):

| Parte | Líneas | Ramas | Umbral |
| --- | --- | --- | --- |
| Dominio y aplicación de la API (todos los módulos) | **99.3 %** | **96.4 %** | 80 % por archivo (obligatorio) |
| Portal | 91.1 % | 79.4 % | Sin umbral |

La tabla completa por módulo y capa sale de `node tests/analisis/resumen-cobertura.mjs` y se publica
en el resumen del job `cobertura`.

Infraestructura y presentación tienen menos cobertura **unitaria** a propósito. Esas capas las prueban
las pruebas de integración, contra PostgreSQL y Redis reales, que no cuentan en este número.

## 6. Limitaciones conocidas

- **Mediciones del flujo de carga**: ya ejecutadas (corrida 45106710381). La primera corrida mostró 13 %
  de errores con 2,000 usuarios por el proxy nginx; se diagnosticó y corrigió (ver
  [atributos-de-calidad.md](atributos-de-calidad.md), EQ-01 y EQ-02).
- **Entorno de la carga**: k6 y el sistema comparten la máquina del ejecutor. Los resultados son un piso,
  no el rendimiento del servidor. La medición definitiva es del Sprint 3, con k6 en otra máquina.
- **Producción**: el despliegue, el TLS en internet, la disponibilidad mensual y el SUS con personas son
  del Sprint 3.
- **Arranque en modo producción**: con `NODE_ENV=production`, la API exige un envío real del código de
  verificación y hoy solo existe el simulado. Antes del despliegue hay que decidir cómo se envía el
  código en producción.
- **Servicios externos simulados**: validación de DNI/RUC, SMS y correo hasta que la Municipalidad los
  contrate (ADR-003).
- **Alta disponibilidad de la base**: un solo servidor por ahora. Patroni queda como siguiente paso
  (ADR-008).
