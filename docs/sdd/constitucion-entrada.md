Escribe la constitución en español para el Sistema de Licencias de Funcionamiento de la Municipalidad Provincial de Huanta, basándote en los documentos de docs/. Principios no negociables:



1\. Monolito modular con 9 módulos (docs/03-diseno-de-software) y Clean Architecture: domain, application, infrastructure, presentation. El dominio no importa nada externo y un módulo no importa el interior de otro; solo sus fachadas.

2\. Contrato primero: toda API sigue docs/06-contrato-api/openapi.yaml. Si hay que cambiar un endpoint, primero se cambia el contrato.

3\. El modelo de datos sigue docs/05-modelo-de-datos (un esquema PostgreSQL por módulo, FK solo dentro del módulo, datos personales cifrados).

4\. TypeScript estricto. Nombres del dominio en español.

5\. Toda tarea incluye su prueba: Jest para unitarias, Supertest para integración, cobertura mínima de 80 % en domain y application.

6\. Los umbrales de calidad EQ-01 a EQ-07 (docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md) son criterios de aceptación.

7\. Seguridad: nunca datos personales en URL, logs ni mensajes de error (Ley N.° 29733, ADR-007).

8\. Git: una rama por funcionalidad, commits convencionales (feat, fix, test, docs, chore) y PR con CI en verde antes de fusionar.



Versión 1.0.0, ratificada hoy.

