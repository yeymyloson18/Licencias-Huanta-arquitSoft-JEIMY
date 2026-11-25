# Lista de calidad de la especificación: Diseño visual del portal con CoreUI

**Propósito**: validar que la especificación esté completa y tenga calidad antes de pasar al plan
**Creada**: 2026-11-25
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

- CoreUI, TypeScript, Lighthouse, `<dialog>` y las bibliotecas excluidas (Redux, `react-router-dom`,
  Chart.js, simplebar) aparecen porque la usuaria los pidió explícitamente. Son restricciones del
  pedido (FR-026 y FR-027), no decisiones de diseño de la especificación.
- Valores elegidos por defecto (en Supuestos):
  - con sesión del personal, la barra pública muestra un enlace a su pantalla de trabajo;
  - `/perfil` usa el área del personal; `/ingresar` y `/cambiar-clave`, el diseño ligero;
  - el rendimiento se compara con la mediana de 3 corridas;
  - la elección de modo se guarda en `localStorage`.
- Restricción encontrada en el código: la política de seguridad de contenido de producción no admite
  scripts ni estilos en línea (FR-003, FR-021). El plan debe resolver cómo pintar el modo correcto
  sin destellos dentro de esa política.
