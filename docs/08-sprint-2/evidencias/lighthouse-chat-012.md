# Accesibilidad del chat de orientación abierto (SC-007 de la 012)

**Medida usada**: Lighthouse 12.2.1 en **modo snapshot**. Un flujo de puppeteer carga la portada,
pulsa "Pregúntanos" y mide con el chat abierto, sin recargar la página
(`tests/e2e/apoyo/lighthouse-chat.mjs`).

Antes se intentó con Lighthouse CI, pero recarga cada URL y el chat se cerraba antes de medir. Como el
modo snapshot funcionó, no hizo falta la alternativa con `@axe-core/playwright`.

**Opciones**: `formFactor: mobile`, pantalla de 360×740 y `deviceScaleFactor: 2`; solo la categoría de
accesibilidad. Son las mismas opciones móviles de las medidas anteriores.

**Dónde se midió**: en local, el 2026-11-25 a las 05:44 UTC, contra el sistema levantado con Docker
Compose (`http://localhost:8080/`). Solo se abrió el chat; no se envió ninguna pregunta, así que no se
usó al proveedor de IA.

| Paso | Modo | Accesibilidad | Auditorías aprobadas |
| --- | --- | --- | --- |
| Portada con el botón "Pregúntanos" | navigation | **1.0 (100)** | 19 de 19 |
| Chat de orientación abierto | snapshot | **1.0 (100)** | 14 de 14 |

**Resultado**: cumple SC-007 (≥ 0.9).

**En CI**: el paso "Lighthouse del chat de orientación abierto (snapshot)" del flujo `E2E` repite la
medida y falla si el puntaje es menor que 0.9. El informe HTML queda en el artefacto `lighthouse-011`.
