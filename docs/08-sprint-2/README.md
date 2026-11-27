# Informe del Sprint 2: Sistema de Licencias de Funcionamiento de Huanta

Este informe resume lo construido en el Sprint 2 y dónde está la evidencia de cada actividad y
entregable que pide la guía del curso. Todo lo que se enlaza está en este repositorio. Las mediciones
pesadas (carga de 2,000 usuarios, Postman y planes de consulta con 10,000 expedientes) corren en
GitHub Actions y dejan sus resultados como archivos descargables (artefactos).

## 1. Actividades del Sprint 2

| N.° | Actividad de la guía | Qué se hizo | Evidencia |
| --- | --- | --- | --- |
| 1 | Implementar el estilo arquitectónico | Monolito modular: 10 módulos en un solo proceso (los 9 del trámite y Orientación, enmienda 1.1.0 de la constitución) y una base con un esquema por módulo (ADR-001) | [`apps/api/src/modulos/`](../../apps/api/src/modulos/), [base-de-datos.md](base-de-datos.md) §1 |
| 2 | Aplicar Clean Architecture | Cada módulo con dominio, aplicación, infraestructura y presentación; un módulo solo usa a otro por su fachada; regla verificada en cada PR | [solid-y-patrones.md](solid-y-patrones.md) §1, [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) |
| 3 | Especificaciones SDD con criterios de aceptación y tareas | Una carpeta por funcionalidad (001 a 013) con especificación, aclaraciones, plan, investigación, contratos, tareas y guía de validación | [`specs/`](../../specs/) |
| 4 | Endpoints REST documentados con OpenAPI/Swagger | Contrato único `openapi.yaml`; Swagger UI interactivo en `/api/docs` generado desde ese archivo; colección de Postman | [`docs/06-contrato-api/`](../06-contrato-api/), [`tests/postman/`](../../tests/postman/) |
| 5 | Analizar la base de datos y la caché | Esquemas, índices, planes de consulta con 10,000 expedientes, bloqueos y conexiones; claves de Redis, TTL, invalidación, fallos y medición | [base-de-datos.md](base-de-datos.md), [cache.md](cache.md) |
| 6 | Aplicar SOLID y patrones | Un ejemplo real por principio y 11 patrones con su archivo, verificados por un script | [solid-y-patrones.md](solid-y-patrones.md) |
| 7 | Pruebas automatizadas con Jest en CI/CD | 5 checks obligatorios en cada PR (compilación, pruebas, cobertura, regla de dependencia y contrato) más E2E, Postman y despliegue | [`.github/workflows/`](../../.github/workflows/) |
| 8 | Pruebas de los escenarios de calidad (hasta 2,000 usuarios) | k6 progresivo hasta 2,000 usuarios con 2 réplicas, Newman, matrices de permisos, privacidad, reloj con 2 instancias, Lighthouse y la evaluación del chat (EQ-08) | [atributos-de-calidad.md](atributos-de-calidad.md); evaluación de la arquitectura en [evaluacion-arquitectura.md](evaluacion-arquitectura.md) |

## 2. Entregables

| Entregable | Dónde está |
| --- | --- |
| Código organizado según la arquitectura | [`apps/api/src/modulos/`](../../apps/api/src/modulos/) (10 módulos × 4 capas), [`apps/web/`](../../apps/web/) (portal) y [`packages/contracts/`](../../packages/contracts/) (tipos generados desde el contrato) |
| Primera versión funcional | Recorrido completo de una licencia (rutas A, B y C): asistente, identidad con código, solicitud, evaluación, pago en caja, inspección, licencia con QR, verificación pública, plazos, avisos y tablero. Se levanta con `docker compose -f infra/docker-compose.yml up -d --build` ([README principal](../../README.md)) |
| Documentación de la API con OpenAPI/Swagger | [`docs/06-contrato-api/openapi.yaml`](../06-contrato-api/openapi.yaml) y Swagger UI en `http://localhost:8080/api/docs/` |
| Pruebas con Jest y reporte de cobertura | §4 de este informe; artefacto `cobertura` del job del mismo nombre en cada ejecución del CI |
| Evidencias de los atributos de calidad | [atributos-de-calidad.md](atributos-de-calidad.md) y [evaluacion-arquitectura.md](evaluacion-arquitectura.md) (ATAM simplificado); artefactos `carga-sprint2`, `planes-bd` y `newman` |

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
  | Portal | React 19 con Vite y CoreUI 5 (ADR-009 y ADR-012) |
  | Chat de orientación | Proveedor de IA compatible con OpenAI, por defecto Groq (ADR-011) |
  | Ejecución | Docker Compose |

- **Los 10 módulos**:

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
  | `orientacion` | Chat "Pregúntanos" con el catálogo y la guía (012) |

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
| 009 Panel del administrador | HU15 ampliada | Panel, auditoría de seguridad con CSV, ficha con cerrar sesiones y desbloquear, y buzón de pruebas en desarrollo |
| 010 Código enviado | HU15 ampliada | Cada código de verificación enviado queda en la auditoría de seguridad, con el destino enmascarado y cómo terminó el intento |
| 011 Mi perfil e inicio por rol | HU15 ampliada | Cada rol llega a su pantalla al ingresar, Mi perfil con sus propios datos y cambio de clave voluntario |
| 012 Chat de orientación | HU01 y HU03 ampliadas | "Pregúntanos" responde preguntas libres sobre licencias solo con el catálogo y la guía, sin datos personales hacia el proveedor de IA (ADR-011) |
| 013 Diseño con CoreUI | — (criterio 7) | Área del personal con menú lateral por rol, portal ligero del ciudadano, tableros con indicadores y modo claro u oscuro, sin cambiar rutas, sesión ni API (ADR-012) |

## 5. Pruebas y cobertura

Cifras de la corrida del CI sobre `main` en el commit `7076895` (con la 011, la 012 y la 013), del
2026-11-25. La cobertura se volvió a calcular con los mismos comandos sobre ese commit el 2026-11-26.

| Tipo | Cantidad | Dónde corre |
| --- | --- | --- |
| Unitarias de la API (Jest) | **1,463** pruebas en 135 archivos | Jobs `pruebas` y `cobertura` del CI, y en local |
| Integración de la API (Jest + Supertest, PostgreSQL y Redis reales) | **748** pruebas en 66 archivos | Job `pruebas` del CI |
| Portal (Jest + Testing Library) | **668** pruebas en 61 archivos | Job `pruebas` del CI y en local |
| Extremo a extremo (Playwright, celular 360×740 y escritorio) | **31** casos en verde: rutas A y B, Mi perfil (011), chat de orientación (012) y diseño (013: menú por rol, modo oscuro sin destello). 15 casos se omiten a propósito: las capturas no corren en el CI y algunos casos son solo de celular o solo de escritorio | Flujo `E2E` |
| Humo de la API (Postman y Newman) | **18** peticiones y **41** aserciones, 0 fallas | Flujo `Postman` |
| Carga (k6) | 387,235 peticiones hasta 2,000 usuarios: p95 6 ms, 0 % de errores | Flujo `Carga Sprint 2`, [`evidencias/carga-2000-despues.txt`](evidencias/carga-2000-despues.txt) |
| Lighthouse (móvil 360×740) | Accesibilidad **100** en claro y en oscuro en las pantallas medidas, y con el chat abierto | Flujo `E2E` y [`evidencias/diseno-013/despues.md`](evidencias/diseno-013/despues.md) |

**Cobertura** (pruebas unitarias; el reporte navegable está en el artefacto `cobertura` de cada
ejecución del CI):

| Parte | Líneas | Ramas | Umbral |
| --- | --- | --- | --- |
| Dominio y aplicación de la API (todos los módulos) | **99.4 %** | **97.0 %** | 80 % por archivo (obligatorio) |
| Toda la API (incluye infraestructura y presentación) | 59.8 % | 70.0 % | Sin umbral (ver la nota) |
| Portal | 92.3 % | 81.3 % | Sin umbral |

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

## 7. Mejora posterior al cierre: panel del administrador (009)

Después del cierre, la funcionalidad 009 amplió la HU15 a pedido de la usuaria
([`specs/009-panel-administrador/`](../../specs/009-panel-administrador/)):

- **Panel** del administrador en `/admin`, que es su inicio al ingresar.
- **Auditoría de seguridad** (21 acciones, solo de agregar, sin datos personales) con filtros y CSV.
  Catálogo y feriados llegan por la cola de eventos, sin escribir en el esquema de seguridad.
- **Ficha del usuario** con "Cerrar todas sus sesiones" y "Desbloquear cuenta".
- **Buzón de pruebas** (Mailpit) en desarrollo: los códigos y avisos se ven en una página web, así
  todo se prueba por el enlace. Está prohibido en producción, como el envío simulado.

Mejora la evidencia de EQ-04: nueva matriz de permisos (`matriz-permisos-009`) y prueba de
privacidad (`privacidad-009`), además de una prueba con 10,000 eventos para el tiempo del panel.

La funcionalidad 010 ([`specs/010-codigo-enviado/`](../../specs/010-codigo-enviado/)) suma a la
auditoría cada **código enviado** (con el destino enmascarado y cómo terminó el intento) y el límite
de códigos, y la tarjeta "Códigos enviados" del panel; el administrador nunca ve el código.

## 8. Mejora posterior al cierre: Mi perfil y pantalla de inicio por rol (011)

La funcionalidad 011 ([`specs/011-mi-perfil-inicio-rol/`](../../specs/011-mi-perfil-inicio-rol/))
vuelve a ampliar la HU15:

- **Pantalla de llegada por rol**: administrador → panel; mesa de partes y evaluador → Expedientes;
  caja → Caja; inspector → Inspecciones; jefatura → Tablero; sin roles → Mi perfil. El regreso a la
  pantalla pedida antes de ingresar solo acepta rutas internas permitidas para el rol (prueba con 22
  entradas de redirección abierta).
- **Mi perfil** (`GET /perfil`, `Cache-Control: no-store`): solo los datos de quien tiene la sesión,
  con el celular enmascarado. El servicio no recibe ningún id.
- **Cambiar mi clave** cuando se quiera, con las reglas de la 002, cierre de las demás sesiones y
  "Clave cambiada" en la auditoría de seguridad.
- El menú del personal ya no tiene "Inicio" ni enlaza al portal público, y las páginas públicas
  muestran "Acceso del personal" cuando no hay sesión.

Evidencia de EQ-04: `matriz-permisos-011` (6 roles, sin sesión, clave temporal, sesión cerrada,
usuario desactivado e id ajeno) y el caso de la 011 en `datos-personales` (respuesta y registros sin
datos personales).

**Evidencia de EQ-05 (accesibilidad a 360 px con sesión)**:

| Medida | Pantallas | Resultado |
| --- | --- | --- |
| Sin desplazamiento horizontal (Playwright, proyecto `celular`, 360×740) | `/perfil` y `/cambiar-clave` con un error visible | `tests/e2e/perfil.spec.ts` en el flujo `E2E`: **en verde** en celular y escritorio ([corrida 45706187541](https://github.com/yeymyloson18/Licencias-Huanta-arquitSoft-JEIMY/actions/runs/45706187541), `main` en `7076895`) |
| Lighthouse móvil, accesibilidad ≥ 0.9 (`@lhci/cli@0.14.0`, 360×740) | `/perfil` | **Cumple**: la aserción ≥ 0.9 de `lhci assert` pasa en el flujo `E2E` (misma corrida; informe en el artefacto de Lighthouse) |
| Lighthouse móvil, accesibilidad ≥ 0.9 (`@lhci/cli@0.14.0`, 360×740) | `/cambiar-clave` (cambio voluntario) | **Cumple**, igual que la anterior |

La aserción de Lighthouse hace fallar el flujo si alguna de estas pantallas baja de 0.9; el puntaje
exacto queda en el informe del artefacto.

## 9. Mejora posterior al cierre: chat de orientación (012)

La funcionalidad 012 ([`specs/012-chatbot-orientacion/`](../../specs/012-chatbot-orientacion/))
agrega el botón **Pregúntanos** en las páginas públicas. Para eso se enmendó la constitución a la
versión 1.1.0: el módulo 10 es "Orientación" y el asistente por WhatsApp sigue en la Fase 2.

- **Fuentes**: responde solo con el catálogo vigente (por la fachada del módulo Catálogo, con su
  caché) y con una guía de preguntas frecuentes.
- **Revisión de cifras**: si una respuesta trae un monto o un plazo que no está en esas fuentes, se
  muestra "No tengo esa información".
- **Datos personales**: DNI, RUC, celular, carné de extranjería y correo se quitan antes de consultar
  al proveedor de IA (ADR-011: compatible con OpenAI, por defecto Groq). No se guardan preguntas ni
  respuestas.
- **Límite**: 10 preguntas cada 15 minutos por conexión, con una huella con sal y sin guardar la IP.
- **Sin proveedor**: si el proveedor falla, no hay clave o se agota la cuota, el chat ofrece el
  asistente "¿Qué licencia necesito?".

**Evidencia** (resultados tal como salieron):

| Medida | Herramienta | Resultado |
| --- | --- | --- |
| EQ-08 · SC-001: respuestas que coinciden con lo esperado (≥ 90 %) | `tests/orientacion/evaluar.mjs`, 37 preguntas, proveedor real, en local (2026-11-25) | **37 de 37 (100 %)** |
| EQ-08 · SC-002: respuestas mostradas con cifras ajenas (0) | La misma evaluación | **0** |
| EQ-08 · SC-003: preguntas fuera del tema o de manipulación rechazadas (100 %) | La misma evaluación | **4 de 4 (100 %)** |
| EQ-08 · SC-005: respuestas en 10 s o menos (≥ 95 %) | La misma evaluación | **37 de 37; p95 3.2 s** |
| SC-004: datos personales fuera del proveedor y de los registros | `privacidad-012` (Jest + Supertest, proveedor simulado) | En verde |
| SC-005: aviso con el proveedor caído (≤ 16 s) | Integración con un servidor local que nunca responde (tiempo máximo de 1 s) | Menos de 2 s |
| SC-007: accesibilidad con el chat abierto (≥ 0.9) | Lighthouse 12.2.1 en modo snapshot, 360×740, en local (2026-11-25) | **1.0** (y 1.0 en la portada) |
| SC-008: la pregunta 11 en 15 minutos no llega al proveedor | `limite-orientacion` (integración) | En verde |

Detalle:
[`evidencias/orientacion-eq08.md`](evidencias/orientacion-eq08.md) y
[`evidencias/lighthouse-chat-012.md`](evidencias/lighthouse-chat-012.md).

**En GitHub Actions** ([corrida 45706187541](https://github.com/yeymyloson18/Licencias-Huanta-arquitSoft-JEIMY/actions/runs/45706187541)): el E2E del chat pasa en celular y escritorio, y Lighthouse da
accesibilidad **1** con el chat abierto (modo snapshot) y en la portada, en claro y en oscuro.

**Pendiente**: la Municipalidad debe revisar la guía de preguntas frecuentes y aprobar el uso del
proveedor en producción (ADR-011).


## 10. Mejora posterior al cierre: diseño del portal con CoreUI (013)

La funcionalidad 013 ([`specs/013-diseno-coreui/`](../../specs/013-diseno-coreui/)) cambia solo la
capa visual del portal, con CoreUI 5 (ADR-012). Las rutas, la sesión, los roles, la API y el backend
no cambian.

- **Personal**: área de administración con menú lateral por rol, barra con migas de pan y
  desplegable del usuario, y pie.
- **Ciudadano**: portal ligero con barra, pie y "Pregúntanos".
- **Componentes comunes**: tablas que se desplazan dentro de su recuadro, estados como insignias de
  color con su nombre, tarjetas de indicadores en el tablero y el panel, y formularios, botones,
  avisos y paginación con el estilo de CoreUI.
- **Modo claro u oscuro**: un botón alterna entre los dos. Sin elección, vale el modo del
  dispositivo.
- **Colores**: los de la Municipalidad (#0b5394 y foco #f2a900).
- **CSP**: no cambia.

**Antes y después** (Lighthouse 12.2.1 móvil 360×740, mediana de 3 corridas, compose aislado;
resultados tal como salieron):

| Pantalla | Rendimiento antes | Después, claro | Después, oscuro | Accesibilidad antes | Después (claro / oscuro) |
| --- | --- | --- | --- | --- | --- |
| Portada | 97 | 95 | 94 | 100 | 100 / 100 |
| Asistente | 98 | 98 | 97 | 100 | 100 / 100 |
| Consulta | 98 | 98 | 98 | 100 | 100 / 100 |
| Ingresar | 99 | 98 | 97 | 100 | 100 / 100 |
| Chat abierto | — | — | — | 100 | 100 / 100 |
| Bandeja | 98 | 95 | 94 | 100 | 100 / 100 |
| Tablero | 98 | 94 | 94 | 100 | 100 / 100 |

"Después" es la medida 4, con el script que evita el destello al cargar (T049). Sin ese script
(medida 3), la portada daba 98 y la bandeja y el tablero 96.

**Lo que no se cumplió** (SC-003, rendimiento ≥ la línea base): solo la consulta queda igual. Las
demás pantallas bajan de 1 a 4 puntos. Hay dos causas:
- **CSS de CoreUI**: bloquea el primer pintado, con 25.4 KB transferidos frente a 5.4 KB antes. En
  las pantallas del personal se suma el módulo del área del personal.
- **`modo-inicial.js`**: también bloquea el pintado, porque así evita el destello. Sube el FCP de la
  portada de 1.7 a 1.9 s. La primera medida había
salido peor (portada 80, tablero 82), por desplazamientos del diseño y un contraste insuficiente en
oscuro; se corrigieron y se volvió a medir.

Detalle de las tres medidas: [`evidencias/diseno-013/despues.md`](evidencias/diseno-013/despues.md).
Línea base: [`evidencias/diseno-013/linea-base.md`](evidencias/diseno-013/linea-base.md).

**Capturas**:
- antes: [`evidencias/diseno-013/antes/claro/`](evidencias/diseno-013/antes/claro/);
- después: [`despues/claro/`](evidencias/diseno-013/despues/claro/) y
  [`despues/oscuro/`](evidencias/diseno-013/despues/oscuro/).

**Pendientes**:
- **Destello al cargar: resuelto (T049)**. Con una elección de modo contraria al dispositivo, el
  primer cuadro salía en el modo del dispositivo. Con la aprobación de la usuaria, el script externo
  `public/modo-inicial.js` en el `<head>` aplica la elección antes del primer pintado, sin cambiar la
  CSP. El E2E lo exige. Cuesta de 1 a 3 puntos de rendimiento (medida 4).
- **Rendimiento**: recuperar los puntos que faltan, recortando más el Sass de CoreUI.
- **CI: resuelto.** En la [corrida 45706187541](https://github.com/yeymyloson18/Licencias-Huanta-arquitSoft-JEIMY/actions/runs/45706187541), el Lighthouse del chat da accesibilidad 1 en claro y en oscuro.
