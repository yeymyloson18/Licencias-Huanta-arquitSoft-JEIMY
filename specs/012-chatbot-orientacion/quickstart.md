# Guía de validación: Chatbot de orientación (012)

## En local, sin el proveedor real

```bash
npm run contrato && npm run generar      # primero el contrato (contracts/api-orientacion.md)
npm run lint && npm run typecheck && npm run formato
npm run regla-dependencia                # el módulo orientacion solo usa la fachada del catálogo
npm run cobertura                        # dominio y aplicación de orientacion ≥ 80 %
npm test -w apps/web
```

Resultado esperado: todo en verde, sin ninguna clave de proveedor.

- **API, unitarias** (`apps/api/test/unit/modulos/orientacion/`):
  - `quitar-datos-personales.spec.ts`: DNI, RUC, celular (con +51, espacios y guiones), CE y correo
    se reemplazan; "EXP-2026-000123", "120 m²", "2024" y "S/ 177.10" se conservan.
  - `revisar-cifras.spec.ts`: una tasa o un plazo que no están en el contexto da
    `SIN_INFORMACION`; los del contexto pasan.
  - `seleccionar-contexto.spec.ts`: "bodega" elige la receta de bodega; "cómo pago" elige el tema
    de pago; sin coincidencias, los temas generales.
  - `responder-pregunta.spec.ts`:
    - límite superado → no llama al proveedor;
    - cada falla del proveedor → `NO_DISPONIBLE`;
    - códigos de receta ajenos → descartados;
    - aclaración solo con `RESPONDIDA`.
  - `proveedor-ia-compatible-openai.spec.ts`: contra un servidor `node:http` local que simula
    200, 429, 401, 500, demora, JSON inválido y vacío. La clave ficticia va en `Authorization` y
    nunca en los errores.
  - `configuracion.spec.ts`: sin clave → chat desactivado y la API arranca; en producción con URL
    `http://` → error que nombra solo la variable.

## En GitHub Actions

- **Job `pruebas` (integración)**, con un proveedor simulado inyectado con `ajustar`:
  - `orientacion.e2e-spec.ts`:
    - 200 según el contrato y con `no-store`;
    - enlaces `FICHA` solo de licencias vigentes;
    - 422 (vacía, 501 caracteres, historial de 7 turnos);
    - sin clave → `NO_DISPONIBLE` con `ASISTENTE` y `LICENCIAS`.
  - `limite-orientacion.e2e-spec.ts`: 10 preguntas → 200; la 11.ª → 429 con `Retry-After` y el
    proveedor simulado recibió solo 10.
  - `privacidad-012` (en `datos-personales.e2e-spec.ts`): con una pregunta y un historial que
    tienen DNI, RUC, celular y correo ficticios, el proveedor simulado no los recibió. Las
    líneas de `LoggerCapturador` no tienen la pregunta, los datos, la IP ni la clave ficticia, y
    Redis no tiene la IP en ninguna clave `lim:orientacion:*`.
- **Postman**: `POST /orientacion/preguntas` con `{}` → 422.
- **Flujo `E2E`**: `tests/e2e/orientacion.spec.ts`, sin clave en el compose de pruebas.
  - Abrir "Pregúntanos" en `/`, escribir y enviar. Se ve el mensaje de `NO_DISPONIBLE` y el enlace
    "¿Qué licencia necesito?" lleva a `/asistente`.
  - Escape cierra y el foco vuelve al botón.
  - En el proyecto `celular` no hay desplazamiento horizontal con el chat abierto.
  - "Pregúntanos" no aparece en `/ingresar` ni en `/perfil`.
- **Lighthouse móvil** (como en la 011): `tests/e2e/lighthouserc.json` mide `/` con el botón
  "Pregúntanos".
- **Lighthouse con el chat abierto (SC-007)**: `tests/e2e/apoyo/lighthouse-chat.mjs`. Usa Lighthouse
  en **modo snapshot**: un flujo de puppeteer abre "Pregúntanos" sin recargar y mide. Lighthouse CI
  recargaba la página y el chat se cerraba. Corre en el flujo `E2E` y falla si el puntaje es menor
  que 0.9.
  - Primera medida, en local (2026-11-25): **1.0** en la portada y **1.0** con el chat abierto
    (`docs/08-sprint-2/evidencias/lighthouse-chat-012.md`).
  - Correr el E2E sin la clave en `infra/.env`.

## Evaluación EQ-08 con el proveedor real (a pedido, fuera de CI)

Requiere `ORIENTACION_API_KEY` en `infra/.env`, que no se sube al repositorio. Usar un compose
**de pruebas**, nunca el de desarrollo de la usuaria con sus datos.

1. Levantar el sistema con la clave y `ORIENTACION_LIMITE_PREGUNTAS=1000` solo para la evaluación.
2. Correr `node tests/orientacion/evaluar.mjs`. Envía cada pregunta de
   `tests/orientacion/preguntas-prueba.json`, con una pausa entre ellas para respetar la cuota.
   Las preguntas son 30 o más y cubren:
   - las 9 licencias;
   - el proceso;
   - preguntas sin información;
   - preguntas fuera del tema y de manipulación;
   - preguntas con datos personales;
   - consultas de expediente.
3. El informe va a `docs/08-sprint-2/evidencias/orientacion-eq08.md`. Por pregunta muestra el
   resultado esperado y el obtenido, los códigos de receta y si las cifras esperadas aparecen. Al
   final, los totales:
   - **SC-001**: aciertos ≥ 90 %;
   - **SC-002**: 0 cifras ajenas al catálogo en respuestas mostradas;
   - **SC-003**: 100 % de las preguntas fuera del tema rechazadas;
   - **SC-005**: tiempo p95 ≤ 10 s.
4. Si el modelo no acepta `response_format`, repetir con `ORIENTACION_FORMATO_JSON=false` y
   anotarlo (research R-05).

Los resultados se anotan tal como salen. Si no se puede correr (sin clave o sin cuota), queda
"pendiente de medir".

## Recorrido manual

1. Con la clave en `infra/.env`: `docker compose -f infra/docker-compose.yml up -d --build`.
2. En <http://localhost:8080>, pulsar "Pregúntanos" y preguntar "¿Cuánto cuesta la licencia para
   una bodega?". La tasa coincide con la ficha y hay un enlace a la ficha.
3. Preguntar "mi DNI es 40000001, ¿cómo va mi trámite?". Aparecen el aviso de dato personal y el
   enlace "Consultar mi trámite".
4. Preguntar "¿quién ganó el partido?". El chat responde que solo atiende licencias de
   funcionamiento.
5. Cambiar la tasa de una receta en `/admin/catalogo`, esperar como mucho 4 minutos y volver a
   preguntar. El chat da la tasa nueva.
6. Vaciar `ORIENTACION_API_KEY` y reiniciar la API. La API arranca y el chat responde con
   `NO_DISPONIBLE` y el asistente.
7. Con DevTools a 360 px: el chat ocupa la pantalla, no hay desplazamiento horizontal, se usa con
   teclado y Escape lo cierra.
