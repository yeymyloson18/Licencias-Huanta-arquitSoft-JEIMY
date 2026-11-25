# Lista de calidad de la especificación: Chatbot de orientación sobre licencias de funcionamiento

**Propósito**: validar que la especificación esté completa y tenga calidad antes de pasar al plan
**Creada**: 2026-11-24
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs)
- [x] Centrada en el valor para el usuario y las necesidades del negocio
- [x] Escrita para personas no técnicas
- [x] Todas las secciones obligatorias completas

## Completitud de los requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION]
- [x] Los requisitos se pueden probar y no son ambiguos
- [x] Los criterios de éxito se pueden medir
- [x] Los criterios de éxito no dependen de la tecnología
- [x] Todos los escenarios de aceptación están definidos
- [x] Los casos límite están identificados
- [x] El alcance está bien delimitado
- [x] Las dependencias y los supuestos están identificados

## Preparación de la funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales
- [x] La funcionalidad cumple los resultados medibles de los criterios de éxito
- [x] No se filtran detalles de implementación en la especificación

## Notas

- Los nombres de las variables (`ORIENTACION_API_URL`, `ORIENTACION_MODELO`,
  `ORIENTACION_API_KEY`), el formato compatible con OpenAI y el proveedor y modelo por defecto
  (Groq, `openai/gpt-oss-120b`) aparecen porque los pidió la usuaria explícitamente. No se
  consideran detalles de implementación elegidos por la especificación.
- Valores elegidos por defecto (en Supuestos): 10 preguntas cada 15 minutos por huella de conexión,
  500 caracteres por pregunta, 15 s de tiempo máximo con el proveedor y las últimas 6 preguntas y
  respuestas como contexto.
- Dependencias que bloquean el plan: enmienda de la constitución (módulo nuevo y chat fuera de
  alcance) y número del ADR (ADR-008 ya está ocupado; se propone ADR-011).
