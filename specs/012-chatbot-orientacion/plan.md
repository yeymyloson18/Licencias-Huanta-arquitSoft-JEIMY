# Plan de implementación: Chatbot de orientación sobre licencias de funcionamiento

**Rama**: `012-chatbot-orientacion` | **Fecha**: 2026-11-24 | **Especificación**: [spec.md](spec.md)

**Entrada**: especificación de `specs/012-chatbot-orientacion/spec.md`.

## Resumen

Un chat público "Pregúntanos" en las páginas del administrado responde preguntas sobre las
licencias de funcionamiento. Usa solo dos fuentes:

- el catálogo de recetas vigente, leído por la fachada del módulo `catalogo` con su caché de Redis;
- una guía de preguntas frecuentes versionada como datos.

El backend, en un módulo nuevo `orientacion` con Clean Architecture, hace lo siguiente:

1. quita DNI, RUC, celular, CE y correo de la pregunta y del historial;
2. aplica un límite de 10 preguntas cada 15 minutos por huella con sal en Redis, sin guardar la IP;
3. elige el contexto relevante;
4. llama al proveedor compatible con OpenAI (Groq, `openai/gpt-oss-120b`) con `fetch` nativo y
   `AbortController` (15 s);
5. revisa la respuesta: valida el JSON, descarta códigos de receta ajenos y cambia a "no tengo esa
   información" si aparece una cifra que no está en el contexto.

Si el proveedor falla, no hay clave o se agotó la cuota, el chat responde `NO_DISPONIBLE` y ofrece
el asistente "¿Qué licencia necesito?". No se guardan preguntas ni respuestas.

## Contexto técnico

**Lenguaje y versión**: TypeScript estricto en Node.js ≥ 24 (`fetch` y `AbortSignal.timeout`
nativos).

**Dependencias principales**: las que ya existen. NestJS 11, zod, ioredis, React 19 con React
Router y Vite. **Sin SDK de IA ni dependencias nuevas.**

**Almacenamiento**:

- sin tablas ni migraciones;
- en Redis, solo el contador `lim:orientacion:<huella>` (15 min);
- el catálogo se lee de la caché de Redis del módulo `catalogo`, por su fachada;
- la guía es un JSON en el módulo, validado al arrancar.

**Pruebas**:

- Jest (unitarias de dominio, aplicación y adaptador con un servidor `node:http` local);
- Supertest (integración con un proveedor simulado inyectado con `crearAplicacionDePrueba({
  ajustar })`);
- Jest y Testing Library en el portal;
- Playwright a 360 px y Lighthouse en el flujo `E2E`;
- Postman de humo;
- evaluación EQ-08 a pedido contra el proveedor real, fuera de CI.

**Plataforma**: Docker Compose (desarrollo y producción), API sin estado detrás de nginx.

**Tipo de proyecto**: aplicación web (monorepo `apps/api` y `apps/web`, contrato en
`docs/06-contrato-api/`).

**Metas de rendimiento**: p95 ≤ 10 s por respuesta con el proveedor funcionando (SC-005). Con el
proveedor caído, la respuesta llega en 16 s o menos. La pregunta no toca PostgreSQL.

**Restricciones**:

- nivel gratuito del proveedor (límites por minuto y por día): contexto acotado (research R-04) y
  límite por persona;
- la clave del proveedor solo en `infra/.env`;
- nada de datos personales hacia el proveedor ni en los registros.

**Escala y alcance**: 1 endpoint público, 1 módulo, unos 20 temas en la guía, 9 recetas, 2
componentes del portal y 30 o más preguntas de evaluación.

## Verificación constitucional

*Puerta: debe pasar antes de la fase 0. Se revisa otra vez después del diseño.*

| Principio | Estado | Cómo se cumple |
| --- | --- | --- |
| I. Monolito modular con Clean Architecture | ⚠️ Pasa **con enmienda** | Módulo nuevo `orientacion` con las 4 capas. El dominio no importa NestJS, Redis ni HTTP. Solo usa `FachadaCatalogo` y el puerto compartido `ProtectorDatos`. La constitución fija 9 módulos: la **enmienda 1.1.0** va como primera tarea del mismo PR (ver "Seguimiento de complejidad"). Se verifica con dependency-cruiser. |
| II. Contrato primero | ✅ | `POST /orientacion/preguntas` y sus esquemas se agregan a `openapi.yaml` antes del código ([contracts/api-orientacion.md](contracts/api-orientacion.md)). La integración valida con `esperarCumpleContrato`. |
| III. Modelo de datos por módulo | ✅ | Sin tablas ni esquema nuevo. No lee tablas del catálogo: solo su fachada (pedido de la usuaria). |
| IV. TypeScript estricto y español | ✅ | Nombres en español (`ResponderPregunta`, `quitarDatosPersonales`, `LimitadorPreguntas`). Sin `any`: la respuesta del proveedor se valida con zod. |
| V. Toda tarea incluye su prueba | ✅ | Unitarias, adaptador contra un servidor local, integración con proveedor simulado y portal. Cobertura ≥ 80 % en `dominio/` y `aplicacion/` de `orientacion`. **Nunca** la clave real en pruebas ni en CI. |
| VI. Escenarios de calidad | ✅ | EQ-03, EQ-04, EQ-05 y EQ-06, más el **EQ-08 nuevo** (exactitud de la orientación), con conjunto de preguntas y medida (research R-12). |
| VII. Datos personales | ✅ | Se quitan antes del proveedor (también del historial). Pregunta en el cuerpo, nunca en la URL. Registros solo con resultado, duración y modelo. Huella HMAC con sal, sin IP. Pruebas de privacidad `privacidad-012`. |
| VIII. Flujo Git | ✅ | Rama `012-chatbot-orientacion`, commits convencionales, PR con CI en verde. |
| Alcance: "asistente por chat (Fase 2)" fuera de alcance | ⚠️ Pasa **con enmienda** | La misma enmienda 1.1.0 aclara que el chat de orientación del portal entra en la Fase 1 y que el asistente por WhatsApp (RC13) sigue en la Fase 2. Se actualiza el README. |
| Restricción ADR-002 (motor único y catálogo) | ✅ | El chat no tiene reglas del TUPA. Toma tasas, plazos y requisitos del catálogo y la revisión de cifras lo garantiza. |

**Resultado antes del diseño**: pasa, condicionado a la enmienda 1.1.0 en el mismo PR. Ninguna
excepción queda sin justificar.

**Revisión después del diseño**:

- el diseño no agrega tablas, dependencias ni accesos entre módulos fuera de la fachada;
- la huella usa `ProtectorDatos` de `compartido`, como ya hacen seguridad y trámites;
- el adaptador del proveedor queda solo en `infraestructura/`.

Sigue pasando con la misma condición.

### Documentos que cambian con la enmienda y el diseño

- `.specify/memory/constitution.md`: versión 1.1.0, con el informe de impacto.
- `README.md`: alcance (el chat del portal entra en la Fase 1) y una sección de la 012.
- `docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md`: módulo 10,
  "Orientación".
- `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`: **ADR-011** "Proveedor externo
  de IA para la orientación". **ADR-008 ya existe** (Patroni), así que la decisión pedida como
  "ADR-008" se registra con el siguiente número libre.
- `docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md`: **EQ-08**, exactitud de la
  orientación.
- `docs/04-modelo-c4/Nivel1-DiagramadeContextodelSistema.md` y `Nivel2-…`: sistema externo
  "Proveedor de IA".
- `docs/03-diseno-de-software/diagrama-casos-de-uso.md`: CU32 "Preguntar al chat de orientación".
- `docs/06-contrato-api/README.md`: fila y operación.
- `.env.example`, `infra/docker-compose.yml` e `infra/produccion/docker-compose.yml`: variables
  `ORIENTACION_*` con valores vacíos por defecto y **sin clave**.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/012-chatbot-orientacion/
├── spec.md
├── plan.md                 # este archivo
├── research.md             # fase 0 (R-01 a R-13)
├── data-model.md           # fase 1: objetos, puertos, Redis y configuración
├── quickstart.md           # fase 1: validación
├── contracts/
│   ├── api-orientacion.md  # POST /orientacion/preguntas
│   ├── proveedor-ia.md     # interfaz de salida con el proveedor (ADR-011)
│   └── portal-orientacion.md
├── checklists/requirements.md
└── tasks.md                # fase 2 (/speckit-tasks)
```

### Código fuente

```text
apps/api/src/modulos/orientacion/
├── dominio/
│   ├── pregunta-orientacion.ts        # objeto de valor (1–500, historial ≤ 6)
│   ├── quitar-datos-personales.ts     # FR-014 (puro)
│   ├── seleccionar-contexto.ts        # research R-04 (puro)
│   ├── revisar-cifras.ts              # FR-005 (puro)
│   ├── mensajes-orientacion.ts        # mensaje de sistema y textos fijos
│   ├── respuesta-orientacion.ts       # resultados, enlaces y aclaración
│   └── puertos.ts                     # FuenteCatalogo, FuenteGuia, ProveedorOrientacion, LimitadorPreguntas, Reloj
├── aplicacion/
│   └── responder-pregunta.ts          # caso de uso
├── infraestructura/
│   ├── fuente-catalogo-fachada.ts     # FachadaCatalogo (con caché)
│   ├── guia/guia-orientacion.json     # temas de la guía (datos)
│   ├── guia-orientacion-archivo.ts    # carga y valida con zod
│   ├── proveedor-ia-compatible-openai.ts  # fetch + AbortController
│   └── limitador-preguntas-redis.ts   # INCR/EXPIRE NX, huella HMAC
├── presentacion/
│   ├── orientacion.controller.ts      # POST /orientacion/preguntas, no-store
│   └── esquemas-orientacion.ts        # zod del cuerpo
└── orientacion.module.ts              # raíz de composición (token PROVEEDOR_ORIENTACION)

apps/api/src/compartido/infraestructura/configuracion.ts   # variables ORIENTACION_*
apps/api/src/app.module.ts                                  # importa OrientacionModule

apps/api/test/unit/modulos/orientacion/…                    # dominio, aplicación y adaptador
apps/api/test/integracion/orientacion.e2e-spec.ts
apps/api/test/integracion/limite-orientacion.e2e-spec.ts
apps/api/test/integracion/datos-personales.e2e-spec.ts      # + privacidad-012
apps/api/test/apoyo/proveedor-orientacion-simulado.ts

apps/web/src/componentes/orientacion/
├── BotonPreguntanos.tsx (+ .test.tsx)
├── ChatOrientacion.tsx (+ .test.tsx)
└── enlacesOrientacion.ts               # tipo → ruta interna
apps/web/src/Aplicacion.tsx             # monta el chat en Diseno (solo rutas públicas)
apps/web/src/servicios/clienteApi.ts    # preguntarOrientacion
apps/web/src/estilos/global.css

tests/e2e/orientacion.spec.ts
tests/postman/humo.postman_collection.json
tests/orientacion/preguntas-prueba.json + evaluar.mjs       # EQ-08, a pedido
```

**Decisión de estructura**: el monorepo existente. El módulo nuevo sigue el patrón de `reportes`:
lee otros módulos solo por fachadas y arma sus dependencias en `orientacion.module.ts`. El
portal suma dos componentes al diseño común, como `AvisoNavegacion` y `AccesoPersonal` de la 011.

## Escenarios de calidad

| Escenario | Qué afecta | Cómo se mide |
| --- | --- | --- |
| EQ-03 | Una falla del proveedor no afecta al resto | Integración: proveedor caído → `NO_DISPONIBLE` y las demás rutas responden igual. E2E sin clave. |
| EQ-04 | Datos personales, clave y límite | `privacidad-012`, `limite-orientacion` y ZAP sobre el endpoint público. |
| EQ-05 | Chat a 360 px, con teclado y con lector de pantalla | Playwright (`celular`) y Lighthouse ≥ 0.9. |
| EQ-06 | Cambiar el catálogo o la guía sin programar; módulo aislado | Prueba con un catálogo cambiado y dependency-cruiser. |
| EQ-08 (nuevo) | Exactitud de la orientación | `tests/orientacion/evaluar.mjs`, que mide SC-001 a SC-003 y SC-005. Los resultados se anotan tal como salen o quedan "pendiente de medir". |

## Seguimiento de complejidad

| Excepción | Por qué hace falta | Alternativa más simple descartada |
| --- | --- | --- |
| Módulo 10 (`orientacion`) cuando la constitución fija 9 | Aísla la dependencia externa y su falla (EQ-03, EQ-06). Lo pidió la usuaria. | Ponerlo en `catalogo`: el catálogo dependería de la red y de un proveedor no confiable. Se resuelve con la enmienda MINOR 1.1.0 en el mismo PR. |
| Chat de orientación que la constitución deja para la Fase 2 | Es el objetivo de esta funcionalidad, pedida por la usuaria. | Esperar a la Fase 2: deja sin orientación libre al administrado. La enmienda deja el asistente por WhatsApp en la Fase 2. |
| Contador de Redis propio (en lugar de reutilizar el de seguridad) | Un módulo no puede importar `seguridad/infraestructura` (principio I). | Mover el contador a `compartido/` y migrar la 002: refactor de seguridad fuera de alcance; queda como mejora. |
