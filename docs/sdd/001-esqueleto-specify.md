Funcionalidad 001: Esqueleto del sistema.



Como desarrolladora necesito una base del proyecto que se levante con un solo comando, para construir encima los 9 módulos sin volver a configurar nada.



Qué debe cumplir:

\- El backend responde un chequeo de salud que indica si la base de datos y la caché están funcionando. Lo usarán el balanceador y Uptime Kuma (EQ-03).

\- La base de datos se crea con el esquema y los datos semilla del TUPA de docs/05-modelo-de-datos, de modo que el catálogo ya tenga las 9 licencias.

\- El portal web muestra una página de inicio que consulta y lista el catálogo de licencias desde el backend, legible en un celular.

\- Existe la estructura vacía de los 9 módulos con sus 4 capas, según la constitución.

\- Cada pull request ejecuta automáticamente la compilación, las pruebas, la cobertura y la verificación de que ninguna capa ni módulo rompe la regla de dependencia (EQ-06).

\- Cualquier persona puede levantar el sistema siguiendo el README, sin secretos reales en el repositorio.



Fuera de alcance de esta funcionalidad: inicio de sesión, trámites, pagos y cualquier regla de negocio.



Cubre: criterios 3, 12 y 14 del plan de trabajo; escenarios EQ-03 y EQ-06.

