# Evidencias de los atributos de calidad (EQ-01 a EQ-08)

Los escenarios y sus medidas están en
[`docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md`](../01-analisis-de-sistema/08-escenarios-atributos-calidad.md)
(Sprint 1). Esta página reúne lo medido en las funcionalidades 003 a 007, lo nuevo de la 008 y lo que
agregaron después la 009 a la 013 (el EQ-08 nació con el chat de la 012). La evaluación de la
arquitectura frente a estos escenarios (árbol de utilidad, compromisos y riesgos) está en
[evaluacion-arquitectura.md](evaluacion-arquitectura.md).

**Estados**:

- **Cumple**: hay evidencia que alcanza la medida.
- **Cumple parcialmente**: se midió en el entorno del curso, pero falta confirmarlo en el servidor o
  alguna parte queda para después.
- **Pendiente (Sprint 3)**: solo se puede medir con el sistema publicado o con personas.

## Resumen

| EQ | Atributo | Estímulo | Medida esperada (Sprint 1) | Herramienta | Resultado obtenido | Evidencia | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EQ-01 | Rendimiento | Consultas del catálogo y del estado, hasta 1,000 usuarios | p95 ≤ 2 s y < 1 % de errores | k6 | **1,000 usuarios**: catálogo p95 6.4 ms con 0.01 % de errores (003); consulta del estado p95 113.6 ms con 0.02 % de errores (004). **Carga progresiva hasta 2,000 usuarios** (008, después del ajuste de nginx): p95 **6 ms** en 2,000 y **0 %** de errores en 387,235 peticiones | [`evidencias/carga-2000-despues.txt`](evidencias/carga-2000-despues.txt); README §003 y §004 | Cumple (falta repetirlo contra el servidor en el Sprint 3) |
| EQ-02 | Escalabilidad | Picos de 1,000 a 10,000 usuarios | p95 ≤ 3 s con más instancias | k6 + `--scale api=2` | Dos réplicas detrás de nginx atendieron solicitudes y descargas sin errores (004). Carga progresiva hasta 2,000 con 2 réplicas: 0 % de errores, p95 6 ms; cada réplica llegó a 64 % de CPU y 210 MiB. Se encontró y corrigió el cuello de botella del proxy (ver detalle). 10,000 no es alcanzable en el entorno del curso | [`evidencias/carga-2000-antes.txt`](evidencias/carga-2000-antes.txt) y [`-despues.txt`](evidencias/carga-2000-despues.txt) | Cumple parcialmente (hasta 2,000) |
| EQ-03 | Disponibilidad | Cae una instancia o la base | 99.5 % mensual; recuperación ≤ 5 min sin perder pagos | Docker, PgBouncer, respaldos y Uptime Kuma | Réplicas sin estado; la salud informa `DEGRADADO` si cae Redis y sigue atendiendo; la cola de eventos es idempotente y los pagos usan transacciones. Respaldos y restauración preparados (007). La disponibilidad mensual solo se mide en producción | `apps/api/src/operacion/salud/`, `infra/produccion/` | Pendiente (Sprint 3) |
| EQ-04 | Seguridad | Accesos sin sesión, sin rol o con datos ajenos | 100 % rechazados; bloqueo al 6.º intento; sin datos personales en errores ni en el QR | Jest + Supertest, ZAP, testssl | Matrices de permisos: 75 casos (005), 57 (006) y las del tablero y reportes (007), todas con 401 o 403 y sin cambiar datos. Pruebas de privacidad en 004 a 007. ZAP baseline: 0 alertas altas, medias o bajas en el portal (002 y 004). Matrices de la 009 y la 011 (6 roles, sin sesión, clave temporal, sesión cerrada e id ajeno). Recorrido de humo con Newman: 18 peticiones y 41 aserciones, 0 fallas (flujo `Postman`). El chat (012) quita DNI, RUC, celular y correo antes del proveedor (`privacidad-012`). TLS en internet: Sprint 3 | `apps/api/test/integracion/` (`matriz-permisos-*` y `privacidad-*`); artefacto `newman` | Cumple parcialmente (falta TLS en el servidor) |
| EQ-05 | Usabilidad | Un administrado nuevo presenta desde el celular | 90 % en ≤ 15 min sin ayuda | Lighthouse, cronómetro y SUS | Accesibilidad Lighthouse móvil **100** en asistente, ficha, identidad, solicitud, comprobante y consulta (003 y 004). Recorrido automatizado a 360 px desde la ficha hasta el comprobante: **81 s** (004). Sin desplazamiento horizontal a 360 px. Con el diseño CoreUI (013): accesibilidad **100 en modo claro y en modo oscuro** en portada, asistente, consulta, ingresar, bandeja, tablero y con el chat abierto; rendimiento 94 a 98 (línea base 97 a 99). SUS con 5 personas: plantilla lista (`docs/07-despliegue/sus.md`) | README §003 y §004; [`evidencias/diseno-013/despues.md`](evidencias/diseno-013/despues.md) | Cumple parcialmente (falta la prueba con personas) |
| EQ-06 | Mantenibilidad | Cambia una tasa o un requisito del TUPA | 0 líneas de código para cambiar una tasa; los demás módulos siguen en verde | Jest, dependency-cruiser y GitHub Actions | El administrador cambia tasas y requisitos desde `/admin/catalogo` sin tocar código (003). Regla de dependencia en verde en cada PR (0 violaciones). 1,463 pruebas unitarias y 748 de integración en el CI (`main`, 2026-11-25). Las 012 y 013 se agregaron sin tocar los demás módulos: sus PR pasaron con todas las pruebas anteriores en verde | `apps/api/src/modulos/catalogo/`, `.dependency-cruiser.cjs`, job `regla-dependencia` | Cumple |
| EQ-07 | Disponibilidad del reloj de plazos | Un expediente se acerca a su vencimiento | 100 % de los expedientes genera **una** alerta; ninguna duplicada | Jest con fechas simuladas y 2 instancias | Prueba con **2 aplicaciones a la vez** contra la misma base: una sola alerta por expediente y vencimiento (candado `pg_try_advisory_xact_lock` + `UNIQUE`). Feriados de 2026 cargados y días hábiles probados con fechas simuladas (006) | `apps/api/test/integracion/reloj-alertas.e2e-spec.ts`, `apps/api/test/unit/compartido/dominio/calendario-habil.spec.ts` | Cumple |
| EQ-08 | Exactitud de la orientación (chat) | Un administrado pregunta con sus palabras sobre licencias | ≥ 90 % de respuestas correctas, 0 cifras ajenas al catálogo, 100 % de fuera de tema rechazado, 95 % en ≤ 10 s | `tests/orientacion/evaluar.mjs` con el proveedor real, Jest y Lighthouse | **37 de 37 (100 %)** correctas, **0** cifras ajenas, **4 de 4** fuera de tema o manipulación rechazadas, **p95 3.2 s** (2026-11-25, en local). Accesibilidad 1 con el chat abierto en claro y oscuro | [`evidencias/orientacion-eq08.md`](evidencias/orientacion-eq08.md); README §9 | Cumple (falta la aprobación de la Municipalidad para producción) |

## Detalle por escenario

### EQ-01 y EQ-02: carga progresiva hasta 2,000 usuarios (nuevo en la 008)

- **Cómo**: flujo [`carga-sprint2.yml`](../../.github/workflows/carga-sprint2.yml), job `carga`, a
  pedido:
  1. levanta el compose del proyecto en el ejecutor de GitHub con **2 réplicas** de la API detrás de
     nginx;
  2. siembra usuarios y expedientes ficticios;
  3. corre [`tests/carga/sprint2-progresivo.js`](../../tests/carga/sprint2-progresivo.js).
- **Etapas**: 100 → 500 → 1,000 → 1,500 → 2,000 usuarios, con 3 minutos de meseta en 2,000 y la bajada.
- **Mezcla**: 35 % lista del catálogo, 25 % ficha, 15 % asistente y 25 % consulta del estado.
- **Umbrales** de EQ-01: p95 < 2 s y errores < 1 %, globales y **por etapa**.
- **Recursos**: se guardan el uso de CPU y memoria de cada contenedor, los aciertos de Redis y las
  conexiones y aciertos de caché de PostgreSQL (`recursos.jsonl`).

Resultado de la corrida 45106710381 (GitHub Actions, 4 procesadores y 15 GiB, 2 réplicas de la API):

| Usuarios | Peticiones | p50 (ms) | p95 (ms) | p99 (ms) | Errores | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 5,208 | 1 | 4 | 5 | 0.00 % | cumple |
| 500 | 12,415 | 0 | 4 | 5 | 0.00 % | cumple |
| 1,000 | 32,445 | 0 | 4 | 6 | 0.00 % | cumple |
| 1,500 | 53,763 | 0 | 4 | 7 | 0.00 % | cumple |
| 2,000 | 283,404 | 1 | 6 | 14 | 0.00 % | cumple |

Total: **387,235 peticiones en 10 minutos, p95 6 ms, 0 % de errores** (k6: 100 % de comprobaciones).

**Recursos en el pico** (máximo durante la carga): cada réplica de la API 64 % de CPU y 210 MiB;
nginx 18 % y 26 MiB; PostgreSQL 14 % y 52 MiB con **2 conexiones activas como máximo**; Redis 10 % y
5 MiB. k6 usó 107 % de CPU (más de un procesador) en la misma máquina.

**Cuello de botella encontrado y corregido** (ejemplo de la actividad 8: medir, diagnosticar, corregir):

| | Antes (corrida 45103775695) | Después (corrida 45106710381) |
| --- | --- | --- |
| 1,500 usuarios | p95 29 ms, **11.8 %** de errores | p95 4 ms, 0 % |
| 2,000 usuarios | p95 912 ms, **12.9 %** de errores | p95 6 ms, 0 % |
| Errores | 37,962 respuestas **502** de nginx | ninguno |
| Causa en el registro de nginx | `connect() failed (99: Address not available)` y luego `no live upstreams` | — |

- **Causa**: nginx abría una conexión TCP nueva hacia la API por cada petición. A más de 400
  peticiones por segundo se agotaron los puertos de la máquina; al primer error nginx daba por caída
  cada réplica (`max_fails=1`) y respondía 502 en cascada. La API y la base nunca fallaron.
- **Corrección** ([`apps/web/nginx.conf`](../../apps/web/nginx.conf) y
  [`nginx-principal.conf`](../../apps/web/nginx-principal.conf)): conexiones persistentes hacia las
  réplicas (`keepalive 128`, HTTP/1.1, cierre a los 4 s, antes que Node), `worker_connections 8192` y
  una réplica sale del reparto recién tras 3 fallas en 5 s.
- **Lección para el Sprint 3**: el proxy de producción (Caddy) también debe reutilizar conexiones
  hacia la API; se verifica con `k6.yml` contra el servidor.

**Límites del entorno, a tener en cuenta al leer los números**:

- El generador de carga (k6) y el sistema comparten la máquina del ejecutor: 2 a 4 procesadores. Con
  2,000 usuarios, k6 consume procesador que le falta al sistema.
- nginx traía 1,024 conexiones por proceso y abría una conexión nueva hacia la API por petición; se corrigió (ver arriba).
- Si una etapa alta se degrada, lo más probable es el procesador compartido, no la base de datos.
- La medida definitiva es del Sprint 3, con k6 en otra máquina (`k6.yml`) contra el servidor.

### EQ-04: recorrido de humo con Postman y Newman (nuevo en la 008)

- **Cómo**: flujo [`postman.yml`](../../.github/workflows/postman.yml), en cada PR y a pedido, con la
  colección [`tests/postman/humo.postman_collection.json`](../../tests/postman/humo.postman_collection.json).
- **Qué prueba**:
  - 5 endpoints públicos responden con éxito en menos de 2 s;
  - 4 protegidos responden 401 sin token;
  - 3 responden 403 con un rol que no corresponde;
  - el tablero responde 200 con JEFATURA.
- **Tokens**: se generan en el ejecutor; ninguno está en el repositorio.

Resultado del flujo `postman.yml` en el PR #35 (corrida 45101490560): **13 peticiones, 31 pruebas,
0 fallas**, tiempo promedio de respuesta 10 ms (máximo 34 ms).

| Grupo | Peticiones | Pruebas aprobadas |
| --- | --- | --- |
| Públicos (salud, catálogo, ficha, preguntas y propuesta) | 5 | 14 de 14 |
| Sin sesión (401) | 4 | 8 de 8 |
| Rol que no corresponde (403) | 3 | 6 de 6 |
| Rol correcto (200, tablero con JEFATURA y sin datos personales) | 1 | 3 de 3 |

### EQ-04: pruebas automáticas de permisos y privacidad (ya en el CI)

- Matrices 401/403:
  - `matriz-permisos-usuarios`, `-catalogo`, `-tramites` y `-evaluacion-pago`;
  - `matriz-permisos-006` (57 casos) y `matriz-permisos-007`.

  Cada operación protegida se prueba sin sesión y con cada rol que no corresponde, y se comprueba que
  no cambien los datos.
- Privacidad: `privacidad-tramites`, `-evaluacion-pago`, `-006` y `-007`. Comprueban que el documento,
  el RUC, el celular, el correo y la dirección no aparezcan en registros, URL, errores, eventos, avisos,
  auditorías, PDF, CSV ni en la caché.
- Límite de intentos: bloqueo al 6.º intento fallido en el ingreso, en la identidad y en la consulta
  (002 y 004). Si Redis falla, se cierra (503).

### EQ-06: regla de dependencia y regresión

- Job `regla-dependencia` en cada PR: 0 violaciones. Detalle en [solid-y-patrones.md](solid-y-patrones.md).
- Cobertura de dominio y aplicación ≥ 80 % **por archivo** (job `cobertura`). Hoy: 99.4 % de líneas y
  97.0 % de ramas en conjunto (`main` en `7076895`).

### EQ-07: reloj de plazos con 2 instancias

- Prueba `reloj-alertas.e2e-spec.ts` (006): dos aplicaciones ejecutan el reloj a la vez y pasadas
  repetidas. Resultado: una sola alerta por expediente y vencimiento.
- Los avisos del ITSE por vencer salen una sola vez aunque el reloj corra en dos réplicas
  (`avisos.e2e-spec.ts`).
