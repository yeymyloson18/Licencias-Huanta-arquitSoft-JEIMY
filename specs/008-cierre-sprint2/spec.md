# Especificación de funcionalidad: Cierre del Sprint 2 (documentación viva de la API, base de datos, caché, SOLID y evidencias de calidad)

**Rama de la funcionalidad**: `008-cierre-sprint2`

**Creada**: 2026-11-22

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/008-cierre-sprint2.md"
(Funcionalidad 008. No agrega funciones de negocio: completa los entregables del Sprint 2 que pide la
guía del curso con evidencias medibles sobre el sistema ya construido en las funcionalidades 001 a
007. Como docente o revisor quiero abrir la documentación interactiva de la API, ver el reporte de
cobertura y revisar las evidencias de cada atributo de calidad, para evaluar el Sprint 2 sin tener que
instalar nada.)

**Cubre**: las 8 actividades y los 5 entregables del Sprint 2 de la guía del curso:

- **Actividades**:
  1. estilo arquitectónico;
  2. Clean Architecture;
  3. especificaciones SDD;
  4. endpoints documentados con OpenAPI y Swagger;
  5. análisis de la base de datos y de la caché;
  6. SOLID y patrones;
  7. pruebas automatizadas en CI;
  8. pruebas de los escenarios de calidad, con hasta 2,000 usuarios virtuales.
- **Entregables**: código organizado, primera versión funcional, documentación de la API, pruebas con
  reporte de cobertura y evidencias de los atributos de calidad.

Escenarios de calidad EQ-01 a EQ-07. El despliegue en el servidor es del Sprint 3 y **no** se toca.

**Restricción del entorno de la usuaria**: su computadora tiene poca memoria. Las mediciones pesadas
corren en los ejecutores de la integración continua, no en local. Esto incluye la carga de 2,000
usuarios, el recorrido de Postman y los planes de consulta con 10,000 expedientes.

## Aclaraciones

### Sesión 2026-11-22

Por indicación de la usuaria, cada pregunta se respondió con la opción recomendada.

- P: ¿El recorrido de humo con Postman pasa a ser un control obligatorio para fusionar? → R: No. Corre
  en un flujo propio en cada pull request y a pedido, y su resultado se ve en el PR. Los 5 controles
  obligatorios no cambian.
- P: ¿La documentación interactiva queda activa o apagada en producción hasta el Sprint 3? → R:
  Apagada por defecto en producción y activa por defecto en desarrollo y pruebas. Un valor de
  configuración la enciende o la apaga en cualquier entorno.
- P: Si la carga de 2,000 usuarios supera los umbrales, ¿el flujo termina en rojo? → R: No. El flujo
  termina en verde y el resumen marca "umbral superado" con la etapa; solo falla si el sistema no
  arranca o la carga no se puede ejecutar. Así el resultado se documenta con honestidad sin bloquear.
- P: ¿Se exige un porcentaje mínimo de cobertura al portal? → R: No se agrega un umbral nuevo. Se
  publica su reporte junto al de la API. El umbral del 80 % sigue en dominio y aplicación de la API.
- P: ¿Dónde corren los planes de consulta con 10,000 expedientes? → R: En un trabajo aparte del mismo
  flujo de carga, a pedido, solo con la base de datos y las migraciones (sin levantar el sistema
  completo). Deja las salidas como archivo descargable.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Documentación interactiva de la API (Prioridad: P1)

Un revisor abre una página del propio sistema con la documentación de todos los endpoints, generada
desde el contrato único. Puede probar los endpoints públicos desde el navegador y, pegando un token del
personal, también los protegidos. El portal y el README enlazan a esa página.

**Por qué esta prioridad**: es un entregable explícito del Sprint 2 (actividad 4) y la forma más
directa de que el docente vea que los endpoints funcionan.

**Prueba independiente**: con el sistema levantado, abrir la página de documentación, ejecutar la
consulta del catálogo y ver la respuesta. Comprobar que la descripción coincide con el contrato del
repositorio y que las demás páginas siguen con las mismas cabeceras de seguridad.

**Escenarios de aceptación**:

1. **Dado** el sistema en desarrollo, **cuando** un revisor abre la página de documentación, **entonces**
   ve todos los grupos de endpoints del contrato con sus esquemas y ejemplos.
2. **Dado** la página de documentación, **cuando** el revisor prueba un endpoint público, **entonces**
   recibe la respuesta real del sistema.
3. **Dado** un endpoint protegido, **cuando** el revisor pega un token válido en "Authorize" y lo prueba,
   **entonces** recibe la respuesta. Sin token, recibe 401.
4. **Dado** la versión en formato de máquina de la documentación, **cuando** se compara con el contrato
   del repositorio, **entonces** es idéntica: hay una sola fuente de verdad.
5. **Dado** que la documentación está desactivada por configuración, **cuando** alguien la pide,
   **entonces** recibe 404.
6. **Dado** cualquier otra página o endpoint, **cuando** se revisan sus cabeceras de seguridad,
   **entonces** son las mismas que antes: solo la página de documentación tiene una política de
   contenido ajustada.

---

### Historia de usuario 2 - Evidencias de los atributos de calidad e informe del Sprint 2 (Prioridad: P1)

El revisor abre un informe del Sprint 2 con una tabla de las 8 actividades y los 5 entregables, cada
uno con el enlace a su evidencia. Desde ahí llega a una tabla por escenario de calidad (EQ-01 a EQ-07)
con lo que se esperaba, lo que se midió, con qué herramienta, la evidencia y el estado.

**Por qué esta prioridad**: es lo que el docente evalúa y lo que la usuaria copia al informe final.

**Prueba independiente**: seguir cada enlace del informe y comprobar que lleva a un archivo, una prueba
o un artefacto existente. Cada escenario tiene un estado justificado.

**Escenarios de aceptación**:

1. **Dado** el informe del Sprint 2, **cuando** el revisor busca una actividad o un entregable de la guía,
   **entonces** encuentra su fila con un enlace que existe en el repositorio.
2. **Dado** la tabla de atributos de calidad, **cuando** el revisor lee un escenario, **entonces** ve el
   estímulo, la medida esperada del Sprint 1, la herramienta, el resultado obtenido, la evidencia y uno
   de tres estados: cumple, cumple parcialmente o pendiente para el Sprint 3.
3. **Dado** un escenario que solo se puede medir en el servidor (TLS en internet, disponibilidad real,
   SUS con personas), **cuando** se revisa su fila, **entonces** figura como pendiente para el Sprint 3,
   con el motivo.
4. **Dado** un resultado que no alcanzó la meta, **cuando** se revisa, **entonces** se informa tal cual,
   con dónde y por qué se degradó, sin ocultarlo.

---

### Historia de usuario 3 - Reporte de cobertura publicado (Prioridad: P2)

Cada ejecución de la integración continua deja el reporte de cobertura de la API y del portal como un
archivo descargable. El README muestra un resumen por módulo y capa.

**Por qué esta prioridad**: es un entregable del Sprint 2 ("pruebas con Jest y reporte de
cobertura").

**Prueba independiente**: abrir una ejecución de la integración continua, descargar el reporte y
abrirlo en el navegador. Comprobar que la tabla del README coincide.

**Escenarios de aceptación**:

1. **Dado** una ejecución del control de cobertura, **cuando** termina, **entonces** deja descargable el
   reporte navegable y el reporte en formato estándar, de la API y del portal.
2. **Dado** el README, **cuando** el revisor busca la cobertura, **entonces** ve una tabla por módulo y
   capa en la que dominio y aplicación tienen 80 % o más.
3. **Dado** la protección de la rama principal, **cuando** se revisan los controles obligatorios,
   **entonces** siguen siendo los mismos 5, con el mismo nombre.

---

### Historia de usuario 4 - Recorrido de humo con Postman (Prioridad: P2)

Hay una colección de Postman generada desde el contrato, con un entorno de desarrollo sin secretos.
Un recorrido de humo prueba los endpoints públicos y comprueba que los protegidos responden 401 y 403.
Se ejecuta en la integración continua y deja un reporte navegable.

**Por qué esta prioridad**: la guía cita Postman como herramienta para validar los atributos de
calidad. Además, la colección sirve al docente para probar la API.

**Prueba independiente**: importar la colección en Postman con el entorno y ejecutar una petición.
Revisar en la integración continua el reporte del recorrido de humo.

**Escenarios de aceptación**:

1. **Dado** la colección y el entorno del repositorio, **cuando** el revisor los importa, **entonces**
   puede ejecutar las peticiones contra el sistema local sin tener que escribir ninguna clave.
2. **Dado** el recorrido de humo, **cuando** corre en la integración continua, **entonces** los
   endpoints públicos responden con éxito, los protegidos responden 401 sin token y 403 con un rol
   que no corresponde, y queda un reporte navegable.
3. **Dado** el repositorio, **cuando** se busca una clave o un token en la colección o en el entorno,
   **entonces** no hay ninguno. Los usuarios del recorrido se crean en el ejecutor.

---

### Historia de usuario 5 - Carga progresiva hasta 2,000 usuarios simultáneos (Prioridad: P2)

A pedido, la integración continua levanta el sistema completo con dos copias del servicio, siembra
datos ficticios y simula usuarios en etapas: 100, 500, 1,000, 1,500 y 2,000, con una meseta en 2,000 y
la bajada. Usa una mezcla realista de consultas públicas. Guarda el resumen, un reporte navegable y el
consumo de recursos del sistema durante la prueba.

**Por qué esta prioridad**: la guía pide simular progresivamente hasta 2,000 usuarios virtuales.

**Prueba independiente**: lanzar el flujo a pedido y descargar los resultados. Revisar el percentil 95,
la tasa de errores por etapa y el consumo de recursos.

**Escenarios de aceptación**:

1. **Dado** el flujo de carga, **cuando** se lanza, **entonces** el sistema se levanta en el ejecutor con
   dos copias del servicio y datos sembrados, sin usar ningún secreto del repositorio.
2. **Dado** la prueba en curso, **cuando** sube por las etapas, **entonces** se mezclan consultas del
   catálogo, de la ficha de una licencia, del asistente y del estado de expedientes sembrados.
3. **Dado** que la prueba termina, **cuando** se revisan los resultados, **entonces** están el percentil
   95 y la tasa de errores comparados con la meta (2 segundos y menos de 1 %), un reporte navegable y
   el uso de procesador y memoria de cada contenedor, además de las métricas de la caché y de la base
   de datos.
4. **Dado** que una etapa supera los umbrales, **cuando** se documenta, **entonces** se indica en qué
   etapa se degrada y la causa probable (por ejemplo, el ejecutor comparte el procesador entre el
   generador de carga y el sistema).

---

### Historia de usuario 6 - Análisis de la base de datos (Prioridad: P3)

Un documento explica:

- los esquemas por módulo y por qué existen;
- cada índice y la consulta a la que sirve;
- el plan de ejecución de las consultas críticas con 10,000 expedientes sembrados;
- los bloqueos y transacciones que se usan y qué problema resuelve cada uno;
- las conexiones y el comportamiento observado durante la carga.

Los planes salen de un script reproducible que corre en la integración continua.

**Por qué esta prioridad**: actividad 5 de la guía.

**Prueba independiente**: ejecutar el flujo que siembra 10,000 expedientes y obtiene los planes.
Comparar su salida con la copiada en el documento.

**Escenarios de aceptación**:

1. **Dado** el documento, **cuando** el revisor busca un índice, **entonces** encuentra la consulta a la
   que sirve y el plan que muestra que se usa.
2. **Dado** el script de análisis, **cuando** se ejecuta con 10,000 expedientes, **entonces** produce
   los planes de estas consultas:
   - la bandeja con filtros;
   - la consulta pública por número y huella del documento;
   - el tablero;
   - la búsqueda de una esquela;
   - la toma de eventos pendientes de la cola;
   - el reloj de plazos.
3. **Dado** la sección de bloqueos, **cuando** se revisa, **entonces** cada mecanismo (bloqueo de fila,
   actualización condicional del pago, bloqueos consultivos) tiene el archivo donde se usa y el
   problema que evita.

---

### Historia de usuario 7 - Estrategia de caché documentada y medida (Prioridad: P3)

Un documento explica:

- qué se guarda en la caché y qué no, y por qué nunca se guardan datos personales;
- las claves y su duración;
- cuándo se invalida;
- qué pasa si la caché falla;
- las cabeceras de caché del portal y de la API;
- la tasa de aciertos y la latencia con y sin caché medidas durante la carga.

**Por qué esta prioridad**: actividad 5 de la guía.

**Prueba independiente**: revisar que cada clave documentada existe en el código. Revisar en los
resultados de la carga la tasa de aciertos y la comparación de latencias.

**Escenarios de aceptación**:

1. **Dado** el documento, **cuando** el revisor busca una clave, **entonces** ve su duración, quién la
   invalida y el archivo que la usa.
2. **Dado** que la caché falla, **cuando** se lee el documento, **entonces** queda claro que las lecturas
   siguen desde la base de datos y que la seguridad y los límites de intentos se cierran (rechazan).
3. **Dado** los resultados de la carga, **cuando** se revisan, **entonces** están la tasa de aciertos y la
   latencia de una misma consulta con y sin caché.

---

### Historia de usuario 8 - SOLID y patrones con ejemplos reales (Prioridad: P3)

Un documento muestra cada principio SOLID con un ejemplo real del código (archivo y fragmento corto)
y qué ganaría o perdería el sistema sin él. Lista los patrones usados con su archivo y muestra la
regla de dependencia con un diagrama y la evidencia de su verificación automática.

**Por qué esta prioridad**: actividad 6 de la guía.

**Prueba independiente**: abrir cada archivo citado y comprobar que el fragmento existe.

**Escenarios de aceptación**:

1. **Dado** un principio SOLID, **cuando** el revisor sigue su ejemplo, **entonces** el archivo existe y
   contiene el fragmento citado.
2. **Dado** la lista de patrones, **cuando** se revisa, **entonces** aparecen al menos estos, cada uno con
   su archivo:
   - puertos y adaptadores;
   - fachada por módulo;
   - repositorio;
   - unidad de trabajo;
   - decorador;
   - estrategia;
   - máquina de estados;
   - cola de eventos con bandeja de salida;
   - objeto de valor;
   - guardias.
3. **Dado** la regla de dependencia, **cuando** se revisa, **entonces** hay un diagrama y el enlace al
   control automático que la verifica.

---

### Casos límite

- La documentación interactiva no debe mostrar datos personales en sus ejemplos. Usa solo los
  ejemplos ficticios del contrato.
- Con la documentación desactivada, ni la página ni el contrato en formato de máquina se sirven.
- La documentación interactiva no debe servirse desde fuera del propio sistema: los recursos de la
  página son locales, para no abrir la política de contenido a terceros.
- El recorrido de humo o la carga fallan si el sistema no termina de arrancar: el flujo espera a que
  el sistema esté sano antes de empezar, y si no arranca falla con los registros como evidencia.
- La carga de 2,000 usuarios puede saturar el ejecutor compartido. Se documenta el escalón donde se
  degrada en lugar de bajar la meta en silencio.
- La consulta del estado tiene un límite de intentos por origen: la carga usa números y documentos
  correctos de expedientes sembrados para medir el sistema y no el límite.
- Los planes de consulta dependen de las estadísticas de la base: el script las actualiza antes de
  pedir los planes, para que sean reproducibles.
- Un ejemplo de código citado en un documento puede quedar desactualizado. Los documentos citan el
  archivo y una frase identificable, no números de línea.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Documentación interactiva (historia 1)**

- **FR-001**: El sistema DEBE servir una página de documentación interactiva de la API y el contrato en
  formato de máquina, generados al arrancar desde el contrato único del repositorio, sin duplicarlo.
- **FR-002**: La página DEBE permitir probar los endpoints públicos y, con un token pegado, los
  protegidos.
- **FR-003**: La documentación DEBE poder encenderse o apagarse con un valor de configuración. Por
  defecto está activa en desarrollo y pruebas y apagada en producción, hasta que el Sprint 3 decida.
- **FR-004**: Solo la página de documentación PUEDE tener una política de contenido distinta. Las
  cabeceras de seguridad del resto del sistema NO DEBEN cambiar.
- **FR-005**: Los recursos de la página DEBEN servirse desde el propio sistema, sin cargar nada de
  terceros.
- **FR-006**: El portal (pie o menú) y el README DEBEN enlazar a la documentación.

**Postman (historia 4)**

- **FR-007**: Debe existir en el repositorio una colección de Postman generada desde el contrato y un
  entorno de desarrollo sin claves ni tokens.
- **FR-008**: Un recorrido de humo DEBE probar los endpoints públicos y los 401 y 403 de los protegidos.
  DEBE ejecutarse en un flujo propio de la integración continua, en cada pull request y a pedido, sin
  sumarse a los 5 controles obligatorios. DEBE dejar un reporte navegable como archivo descargable.
- **FR-009**: Los usuarios que necesite el recorrido DEBEN crearse en el ejecutor, con claves generadas
  ahí mismo.

**Cobertura (historia 3)**

- **FR-010**: El control de cobertura DEBE publicar como archivo descargable el reporte navegable y el
  estándar de la API y del portal, sin cambiar el nombre de ninguno de los 5 controles obligatorios.
- **FR-011**: El README DEBE mostrar la tabla de cobertura por módulo y capa, con dominio y aplicación
  en 80 % o más. Al portal no se le agrega un umbral nuevo; solo se publica su reporte.

**Carga de 2,000 usuarios (historia 5)**

- **FR-012**: Debe existir una prueba de carga por etapas: 100, 500, 1,000, 1,500 y 2,000 usuarios
  simultáneos, con subida gradual, meseta en 2,000 y bajada. Mezcla consultas del catálogo, de la ficha
  de una licencia, del asistente y del estado de expedientes sembrados. Sus umbrales son los de EQ-01:
  percentil 95 menor a 2 segundos y errores por debajo del 1 %.
- **FR-013**: Un flujo de la integración continua, lanzado a pedido, DEBE levantar el sistema con dos
  copias del servicio, sembrar los datos, ejecutar la carga y guardar el resumen y un reporte navegable.
- **FR-014**: Durante la carga se DEBEN registrar el uso de procesador y memoria de cada contenedor y
  las métricas de la caché (aciertos y fallos) y de la base de datos (conexiones activas y aciertos de
  su caché interna).
- **FR-015**: Los resultados DEBEN documentarse tal como salgan, con la etapa donde se superen los
  umbrales y la causa probable. El flujo termina en verde aunque se superen los umbrales y lo indica en
  el resumen. Solo falla si el sistema no arranca o la carga no se puede ejecutar.

**Base de datos (historia 6)**

- **FR-016**: Un documento DEBE explicar:
  - los esquemas por módulo y por qué existen;
  - cada índice con la consulta a la que sirve;
  - los mecanismos de transacción y bloqueo, cada uno con su archivo y el problema que resuelve;
  - las conexiones por copia del servicio y lo observado durante la carga.
- **FR-017**: Un script reproducible DEBE sembrar 10,000 expedientes ficticios, actualizar las
  estadísticas y obtener el plan de ejecución, con tiempos y lecturas, de las 6 consultas críticas:
  - bandeja con filtros;
  - consulta pública;
  - tablero;
  - búsqueda de esquela;
  - toma de eventos;
  - reloj de plazos.

  Se ejecuta en un trabajo aparte del flujo de carga, a pedido, solo con la base de datos y las
  migraciones. Sus salidas quedan como archivo descargable y se copian al documento.

**Caché (historia 7)**

- **FR-018**: Un documento DEBE explicar:
  - qué se guarda en la caché y qué no, y por qué no se guardan datos personales;
  - las claves y su duración: catálogo, 240 segundos en el servidor más 60 en el navegador, 5 minutos
    como máximo;
  - la invalidación al editar recetas;
  - el comportamiento si la caché falla: las lecturas siguen; la seguridad y los límites de intentos
    se cierran;
  - las cabeceras de caché del portal y de la API;
  - la tasa de aciertos y la latencia con y sin caché medidas en la carga.

**SOLID y patrones (historia 8)**

- **FR-019**: Un documento DEBE mostrar cada principio SOLID con un ejemplo real (archivo y fragmento
  corto) y qué se ganaría o perdería sin él.
- **FR-020**: El mismo documento DEBE listar estos patrones, cada uno con el archivo donde se usa:
  - puertos y adaptadores;
  - fachada por módulo;
  - repositorio;
  - unidad de trabajo;
  - decorador;
  - estrategia;
  - máquina de estados;
  - cola de eventos con bandeja de salida;
  - objeto de valor;
  - guardias.

  También DEBE incluir el diagrama de la regla de dependencia y el enlace a su verificación automática.

**Evidencias e informe (historia 2)**

- **FR-021**: Un documento DEBE tener una fila por escenario, de EQ-01 a EQ-07. Cada fila incluye:
  - estímulo;
  - medida esperada;
  - herramienta;
  - resultado obtenido;
  - evidencia enlazada;
  - estado: cumple, cumple parcialmente o pendiente para el Sprint 3.

  Debe usar los resultados de las funcionalidades 003 a 007 y los nuevos de esta funcionalidad.
- **FR-022**: Un informe del Sprint 2 DEBE tener:
  - la tabla de las 8 actividades y los 5 entregables con el enlace a su evidencia;
  - el resumen de la arquitectura;
  - las funcionalidades con sus historias de usuario;
  - las cifras de pruebas y cobertura;
  - las limitaciones conocidas.

  Escrito en español sencillo y con tablas.
- **FR-023**: El README principal DEBE enlazar al informe del Sprint 2, a la documentación interactiva y
  a los archivos descargables de las mediciones.

**Restricciones transversales**

- **FR-024**: Ningún secreto en el repositorio. Los usuarios y claves de las mediciones se generan en
  el ejecutor.
- **FR-025**: Los 5 controles obligatorios siguen con su nombre y en verde. La cobertura de dominio y
  aplicación sigue en 80 % o más.
- **FR-026**: No se cambia ninguna función de negocio ni el diagrama de casos de uso.

### Entidades clave

- **Evidencia de calidad**: escenario (EQ-01 a EQ-07), medida esperada, herramienta, resultado,
  enlace y estado.
- **Resultado de carga**: etapa (usuarios), percentil 95, tasa de errores, peticiones por segundo,
  consumo por contenedor, aciertos de la caché y conexiones de la base.
- **Plan de consulta**: consulta crítica, índice usado, tiempo, lecturas y filas, con 10,000
  expedientes.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Un revisor llega a la documentación interactiva desde el portal o el README en un clic y
  prueba un endpoint público en menos de 1 minuto.
- **SC-002**: La versión en formato de máquina de la documentación coincide al 100 % con el contrato
  del repositorio.
- **SC-003**: Ninguna página distinta de la documentación cambia sus cabeceras de seguridad. Lo
  comprueba una prueba automática.
- **SC-004**: El 100 % de las actividades y de los entregables del Sprint 2 tienen en el informe un
  enlace a una evidencia que existe.
- **SC-005**: Los 7 escenarios de calidad tienen fila, resultado y estado justificado.
- **SC-006**: El recorrido de humo pasa en la integración continua: endpoints públicos con éxito y 100 %
  de los protegidos probados con 401 o 403.
- **SC-007** (EQ-01): La carga llega a 2,000 usuarios simultáneos. Se informa el percentil 95 y la tasa
  de errores de cada etapa frente a la meta (2 s y < 1 %); si se supera, se documenta la etapa y la
  causa.
- **SC-008**: Los planes de las 6 consultas críticas con 10,000 expedientes están en el documento, salen
  del script reproducible y muestran el índice que usa cada una.
- **SC-009**: La cobertura de dominio y aplicación es del 80 % o más, y su reporte se puede descargar de
  cada ejecución de la integración continua.
- **SC-010**: La revisión automática de secretos no encuentra ninguno.

## Supuestos

- La guía del curso pide estas evidencias para el Sprint 2. El despliegue, la medición en internet, la
  disponibilidad real y el SUS con personas son del Sprint 3 y se marcan así.
- Las mediciones pesadas corren en los ejecutores estándar de la integración continua (2 a 4
  procesadores y unos 7 a 16 GB). El generador de carga y el sistema comparten la máquina, así que los
  resultados son un piso, no el rendimiento real del servidor.
- La documentación interactiva queda activa por defecto en desarrollo y pruebas y apagada en
  producción. El Sprint 3 decide si se enciende allí.
- Los documentos se escriben en español sencillo, con tablas, listos para copiar al informe final.
- El contrato no cambia, salvo para documentar las rutas de la documentación si hiciera falta.
- Se reutilizan los resultados ya obtenidos en las funcionalidades 003 a 007:
  - k6 con 1,000 usuarios, Lighthouse y ZAP;
  - matrices de permisos y pruebas de privacidad;
  - reloj de plazos con dos copias del servicio;
  - tiempos de usabilidad.
