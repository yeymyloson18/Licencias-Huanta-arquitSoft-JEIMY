# Evaluación del chat de orientación (EQ-08, funcionalidad 012)

- `preguntas-prueba.json`: el conjunto de preguntas de prueba con lo esperado (resultado, fichas,
  cifras y textos). Tiene 37 preguntas: las 9 licencias, el proceso, preguntas sin información,
  fuera del tema y de manipulación, datos personales ficticios, consultas de expediente y la
  conversación real del 2026-11-24.
- `evaluar.mjs`: envía cada pregunta a la API y escribe
  `docs/08-sprint-2/evidencias/orientacion-eq08.md` con los resultados tal como salen.

## Cómo correrla (a pedido, en local, fuera de CI)

Usa el **proveedor real**. Por eso no corre en CI, y la clave nunca sale de `infra/.env`: el
evaluador no la lee, solo habla con la API por HTTP.

1. Con la clave en `infra/.env`, levantar el sistema con un límite de preguntas alto. El límite normal
   de 10 cada 15 minutos no alcanza para 37 preguntas:

   ```bash
   ORIENTACION_LIMITE_PREGUNTAS=1000 docker compose -f infra/docker-compose.yml up -d --build api web
   ```

2. Correr la evaluación. La pausa por defecto entre preguntas es de 20 s, para respetar los límites
   por minuto del nivel gratuito del proveedor:

   ```bash
   node tests/orientacion/evaluar.mjs --url http://localhost:8080 --pausa 20000
   ```

3. Al terminar, volver al límite normal:

   ```bash
   docker compose -f infra/docker-compose.yml up -d api
   ```

Si el proveedor responde "no disponible", por ejemplo porque se agotó la cuota, el evaluador espera
un minuto y reintenta una vez. Lo que quede sin respuesta se anota tal cual. Los resultados no se
corrigen a mano.
