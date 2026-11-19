Plan técnico de la funcionalidad 003. Respeta la constitución y reutiliza lo hecho en la 001 (catálogo con caché) y la 002 (sesión y roles).



Primero el contrato y el modelo (principios II y III), en el mismo PR:

1\. openapi.yaml: GET /catalogo/recetas/{codigoReceta} responde 404 si la receta está desactivada. POST /asistente/proponer responde 200 con un resultado de dos formas: PROPUESTA (con la receta completa) o NO\_DETERMINADA (con el motivo); 422 solo para respuestas inválidas. Agregar GET /admin/catalogo/recetas y GET /admin/catalogo/recetas/{codigoReceta} (solo ADMINISTRADOR, incluyen las desactivadas). PUT /catalogo/recetas/{codigoReceta} sigue siendo la edición (solo ADMINISTRADOR), sin If-Match porque gana el último que guarda.

2\. Migración 0004 y, en el mismo PR, actualizar docs/05-modelo-de-datos (esquema.sql, datos-semilla.sql, modelo-entidad-relacion.md y diccionario): agregar la opción "No lo sé" a la pregunta NIVEL\_RIESGO; nueva tabla catalogo.cambio\_receta (receta, usuario\_id, fecha, cambios antes/después en jsonb), sin FK hacia seguridad (MD2).



Arquitectura (Clean Architecture, sin romper la regla de dependencia):

\- Dominio: la entidad Receta valida sus reglas (FR-019), incluida la coherencia entre ruta, calificación y orden del ITSE; el objeto de valor Tasa ya existe. El MotorReglasAsistente es una función pura del dominio que evalúa las reglas por prioridad y devuelve la propuesta o "no determinada".

\- Aplicación: casos de uso ObtenerPreguntas, ProponerLicencia, ObtenerFicha, ListarRecetasAdmin y ActualizarReceta. ActualizarReceta calcula el antes/después, guarda la receta y su registro de cambios en una sola transacción, y no registra nada si no hubo cambios.

\- Infraestructura: repositorios Postgres y el Decorator de caché que ya existe, ampliado con invalidación: al guardar se borran las claves de esa receta y de la lista.

\- Presentación: controladores REST; la edición usa @RequiereRoles('ADMINISTRADOR') de la fachada de seguridad.



Tiempo máximo de propagación (FR-024, EQ-06):

\- La invalidación al guardar hace que el cambio se vea en la siguiente consulta.

\- La suma del TTL de Redis y del Cache-Control del navegador no debe superar 300 segundos, aunque falle la invalidación. Propuesta: Redis 240 s y Cache-Control: public, max-age=60.



Portal (React, primero celular):

\- /asistente: una pregunta por pantalla, con avance "Pregunta N de 3", Volver y Empezar de nuevo; las respuestas van en la URL (no son datos personales) para sobrevivir a una recarga.

\- /licencias/:codigo: la ficha, reutilizada por el asistente.

\- /admin/catalogo y /admin/catalogo/:codigo: lista y edición con errores junto a cada campo.



Pruebas:

\- Unitarias del dominio: las 30 combinaciones del asistente en una tabla, y las reglas de validación de Receta.

\- Integración: matriz de permisos 401/403 en los endpoints de administración, invalidación de caché, y registro de cambios atómico.

\- Primer script de k6 para EQ-01 (tests/carga/eq01-catalogo.js) con umbrales p95 ≤ 2 s y errores < 1 %, ejecutable a escala reducida en local.

\- Lighthouse móvil ≥ 90 en accesibilidad y buenas prácticas.

