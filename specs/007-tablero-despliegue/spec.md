# Especificación de funcionalidad: Tablero de jefatura, despliegue en la nube y pruebas del sistema completo

**Rama de la funcionalidad**: `007-tablero-despliegue`

**Creada**: 2026-11-20

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/007-tablero-despliegue.md"
(Funcionalidad 007, la última. Como jefatura quiero un tablero con los trámites por estado, el tiempo
de atención frente al plazo del TUPA y los ingresos en caja, para tomar decisiones y rendir cuentas.
Como Municipalidad quiero que el sistema esté publicado en internet con HTTPS, que soporte picos de
usuarios con varias copias del servicio, que se actualice solo cuando se aprueba un cambio y que sus
datos estén respaldados.)

**Cubre**: HU10 (RF18 y RF19); casos de uso CU20 (ver tablero y reportes) y CU22 (consultar
auditoría, que se cierra con el tablero y los reportes); criterios del proyecto 6 (pruebas de
extremo a extremo), 8 (escalabilidad del portal y del servicio), 9 (escalabilidad de la base de
datos), 10 (DNS y CDN), 11 (caché), 12 (integración y despliegue continuos) y 13 (pruebas de carga);
escenarios de calidad EQ-01, EQ-02, EQ-03, EQ-04 y EQ-05; ADR-005, ADR-008, ADR-009 y ADR-010.
Issues de GitHub: #13 (HU10), #21 (pruebas de extremo a extremo), #22 (SUS), #23 (escalar el servicio
y la base de datos), #24 (dominio, DNS, CDN y TLS), #25 (despliegue continuo) y #26 (pruebas de
carga). Une la parte de tablero de la 009 y la 010 del plan original. Usa todo lo construido en las
funcionalidades 001 a 006.

**Decisiones de la usuaria**: el sistema se publica en un servidor virtual propio (2 GB de memoria,
Ubuntu 24.04 LTS) con contenedores; por ahora **sin dominio propio**. El dominio debe poder agregarse
después cambiando un solo valor de configuración.

## Aclaraciones

### Sesión 2026-11-20

Por indicación de la usuaria, cada pregunta se respondió con la opción recomendada.

- P: ¿Con qué formato se descarga el CSV para que abra bien en Excel en español? → R: Separado por
  punto y coma, en UTF-8 con marca de orden de bytes (BOM), fin de línea CRLF, montos con punto
  decimal y fechas AAAA-MM-DD.
- P: ¿Las pruebas de extremo a extremo pasan a ser un control obligatorio para fusionar? → R: No por
  ahora. Corren en un flujo propio en cada pull request y en cada push a `main`, y su resultado se ve
  en el PR; los 5 controles obligatorios no cambian. La usuaria puede volverlas obligatorias después.
- P: Si la versión nueva no pasa la comprobación de salud, ¿qué se revierte? → R: Solo las imágenes
  (vuelven las anteriores). Las migraciones ya aplicadas se quedan, por eso deben ser compatibles con
  la versión anterior (agregar antes de quitar).
- P: ¿Dónde se guardan las copias de seguridad diarias? → R: En el mismo servidor, en una carpeta
  fuera de los contenedores con permisos solo del usuario del despliegue, y la guía explica cómo
  bajar una copia a la computadora de la usuaria al menos una vez por semana. Un almacenamiento
  externo de pago queda como siguiente paso.
- P: ¿Cómo leen las pruebas de extremo a extremo el código de identidad simulado? → R: Directamente de
  la caché del entorno de pruebas desde el ejecutor de las pruebas. El servicio no tiene ningún
  endpoint para leer códigos, ni en pruebas ni en producción.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Tablero de la jefatura (Prioridad: P1)

La jefatura abre el tablero, elige un rango de fechas (por defecto, el mes actual) y ve cuántos
expedientes hay en cada estado, cuántos días hábiles toma en promedio atender cada tipo de licencia
frente al plazo del TUPA y qué porcentaje se atendió dentro del plazo, y cuánto se recaudó en caja
(total y por tipo de licencia).

**Por qué esta prioridad**: es la única historia de usuario pendiente del backlog (HU10, RF19) y la
que permite a la jefatura rendir cuentas con datos del sistema.

**Prueba independiente**: con expedientes y pagos sembrados en fechas conocidas, abrir el tablero
como jefatura con un rango que los incluye y comprobar los conteos, los promedios en días hábiles,
el porcentaje dentro del plazo y los montos exactos en soles.

**Escenarios de aceptación**:

1. **Dado** que la jefatura abre el tablero sin elegir fechas, **cuando** se carga, **entonces**
   muestra los datos del mes actual (del día 1 a hoy, en hora de Lima).
2. **Dado** un rango con expedientes en varios estados, **cuando** la jefatura lo consulta,
   **entonces** ve la cantidad por estado de los expedientes presentados en ese rango.
3. **Dado** expedientes que terminaron su atención en el rango, **cuando** la jefatura consulta,
   **entonces** ve por tipo de licencia el plazo del TUPA, el promedio de días hábiles que tomó la
   atención y el porcentaje de expedientes atendidos dentro de ese plazo.
4. **Dado** pagos registrados en caja en el rango, **cuando** la jefatura consulta, **entonces** ve el
   total recaudado y el monto por tipo de licencia, exactos al céntimo.
5. **Dado** un rango sin datos, **cuando** la jefatura consulta, **entonces** ve el tablero en cero con
   un mensaje claro, sin errores.
6. **Dado** un celular de 360 px, **cuando** la jefatura abre el tablero, **entonces** lo usa sin
   desplazamiento horizontal y cada gráfico tiene un texto alternativo y una tabla con los mismos
   datos.
7. **Dado** un usuario sin el rol JEFATURA o sin sesión, **cuando** intenta ver el tablero, **entonces**
   el sistema lo rechaza sin mostrar datos.

---

### Historia de usuario 2 - Reporte de licencias y descarga en CSV (Prioridad: P1)

La jefatura consulta las licencias vigentes, los expedientes en trámite o las licencias con el
certificado ITSE por vencer, filtradas por tipo de licencia, giro y zona, y descarga el resultado en
un archivo CSV para trabajarlo en una hoja de cálculo.

**Por qué esta prioridad**: completa RF18 (reportes) y es el insumo para rendir cuentas fuera del
sistema.

**Prueba independiente**: con licencias y expedientes sembrados, pedir cada situación con y sin
filtros, comparar las filas con lo sembrado y abrir el CSV descargado en una hoja de cálculo.

**Escenarios de aceptación**:

1. **Dado** licencias vigentes de varios giros y zonas, **cuando** la jefatura pide las vigentes con
   un giro, **entonces** solo ve las de ese giro, con número, tipo de licencia, titular público, giro,
   zona, estado y fecha.
2. **Dado** expedientes en distintos estados, **cuando** pide los "en trámite", **entonces** ve los que
   aún no tienen decisión final: REGISTRADO, EN_EVALUACION, OBSERVADO, PENDIENTE_PAGO, PAGADO,
   EN_INSPECCION y APROBADO (este último solo mientras se emite la licencia).
3. **Dado** certificados ITSE que vencen en 30 días o menos, **cuando** pide "ITSE por vencer",
   **entonces** ve esas licencias ordenadas por la fecha de vencimiento más cercana.
4. **Dado** un resultado, **cuando** la jefatura elige descargar, **entonces** recibe un archivo CSV que
   abre bien en una hoja de cálculo en español (tildes y eñes correctas) con las mismas filas que ve
   en pantalla.
5. **Dado** cualquier fila, **cuando** se revisa el reporte o el CSV, **entonces** el titular aparece solo
   con su nombre público abreviado y nunca con documento, RUC, celular, correo ni dirección.

---

### Historia de usuario 3 - Recorridos completos probados en el navegador (Prioridad: P2)

Cada cambio que se propone para la rama principal se prueba automáticamente en un navegador real,
en tamaño celular y de escritorio, haciendo el trámite completo como lo haría cada persona: el
administrado usa el asistente, confirma su identidad con el código, presenta la solicitud con sus
documentos; el evaluador confirma el riesgo; caja registra el pago; el evaluador aprueba; se emite la
licencia y cualquiera la verifica con el QR. También el recorrido con inspección previa hasta el
resultado favorable.

**Por qué esta prioridad**: es el criterio 6 del proyecto y la única forma de comprobar que las
pantallas de todas las funcionalidades funcionan juntas.

**Prueba independiente**: ejecutar los recorridos contra el sistema levantado en el entorno de
pruebas y ver que terminan con la licencia verificada; romper a propósito un paso y ver que fallan.

**Escenarios de aceptación**:

1. **Dado** el sistema de pruebas levantado, **cuando** corre el recorrido de la ruta A, **entonces**
   termina con la página pública de verificación mostrando la licencia vigente.
2. **Dado** el mismo entorno, **cuando** corre el recorrido de la ruta B, **entonces** termina con el
   resultado de la inspección favorable registrado y la licencia emitida.
3. **Dado** que corre en tamaño celular (360 px) y de escritorio, **cuando** termina, **entonces** ambos
   pasan.
4. **Dado** que el código de verificación de identidad se envía por un canal simulado, **cuando** el
   recorrido lo necesita, **entonces** lo lee directamente de la caché del entorno de pruebas; el
   servicio no ofrece ninguna forma de leerlo.
5. **Dado** un recorrido que falla, **cuando** se revisa el resultado en la integración continua,
   **entonces** hay capturas y registro del paso que falló, y los 5 controles obligatorios no cambian
   de nombre.

---

### Historia de usuario 4 - Sistema publicado en internet con HTTPS y varias copias del servicio (Prioridad: P2)

La Municipalidad tiene el sistema publicado en una dirección pública con HTTPS válido. Detrás del
punto de entrada corren dos copias del servicio que se reparten el tráfico; si una cae, la otra sigue
atendiendo. La base de datos, la caché y el servicio no se pueden alcanzar desde internet: solo la
web por los puertos estándar. Los archivos del portal se guardan en la caché del navegador por un
año y la página principal nunca. Mientras no haya dominio, la dirección usa la IP del servidor con un
servicio de nombres gratuito; cuando la usuaria compre un dominio, cambia un solo valor y sigue una
guía paso a paso.

**Por qué esta prioridad**: son los criterios 8, 10 y 11 del proyecto y la condición para medir los
escenarios de calidad en un entorno real.

**Prueba independiente**: levantar la configuración de producción en una máquina de pruebas, comprobar
que solo los puertos web responden desde fuera, que las cabeceras de caché y de seguridad son las
esperadas, que la respuesta va comprimida y que al detener una copia del servicio el sistema sigue
respondiendo.

**Escenarios de aceptación**:

1. **Dado** el sistema en el servidor, **cuando** alguien abre la dirección pública, **entonces** ve el
   portal con un certificado válido y conexión TLS 1.3; por HTTP se le redirige a HTTPS.
2. **Dado** el servidor publicado, **cuando** se prueban desde fuera los puertos de la base de datos,
   de la caché y del servicio, **entonces** ninguno responde; solo responden 80 y 443 (y el de
   administración remota, restringido a la llave del despliegue).
3. **Dado** dos copias del servicio, **cuando** se detiene una, **entonces** las consultas siguen
   respondiendo sin errores visibles para el usuario.
4. **Dado** un archivo del portal con huella en el nombre, **cuando** se descarga, **entonces** se
   guarda en caché por un año como inmutable; la página principal llega sin caché; las respuestas con
   datos personales llegan con "no guardar"; el catálogo, con 60 segundos.
5. **Dado** cualquier respuesta de texto, **cuando** el navegador acepta compresión, **entonces** llega
   comprimida.
6. **Dado** que se compra un dominio, **cuando** se cambia el valor del dominio y se sigue la guía
   documentada, **entonces** el sistema queda en el dominio nuevo con HTTPS, con la CDN para los
   archivos del portal y sin cambios de código.
7. **Dado** un contenedor que se cae o el servidor que se reinicia, **cuando** vuelve, **entonces** todos
   los servicios se levantan solos y solo reciben tráfico cuando su comprobación de salud pasa.

---

### Historia de usuario 5 - Datos respaldados y conexiones a la base de datos controladas (Prioridad: P2)

Cada día se guarda automáticamente una copia comprimida de la base de datos y se conservan las de
los últimos 7 días. Hay un procedimiento escrito, probado al menos una vez, para restaurar una copia.
Las copias del servicio se conectan a la base de datos a través de un concentrador de conexiones,
para que agregar copias no multiplique las conexiones. La réplica con conmutación automática queda
documentada como el siguiente paso, con el motivo.

**Por qué esta prioridad**: es el criterio 9 del proyecto y protege los pagos y las decisiones con
efecto legal (EQ-03).

**Prueba independiente**: ejecutar la copia, comprobar el archivo y la rotación de 7 días, restaurar la
copia en una base vacía y comparar la cantidad de expedientes, pagos y licencias; con dos copias del
servicio activas, comprobar que las conexiones a la base no superan el límite configurado.

**Escenarios de aceptación**:

1. **Dado** el servidor funcionando, **cuando** pasa un día, **entonces** hay una copia nueva con la
   fecha en el nombre y no hay copias de más de 7 días.
2. **Dado** una copia, **cuando** se sigue el procedimiento de restauración en una base vacía,
   **entonces** la base restaurada tiene los mismos expedientes, pagos, licencias y auditorías.
3. **Dado** dos copias del servicio bajo carga, **cuando** se miran las conexiones en la base,
   **entonces** no pasan del tamaño fijado para el concentrador, aunque se agreguen copias.
4. **Dado** una copia de seguridad, **cuando** se revisa dónde quedó, **entonces** está fuera de los
   contenedores, con permisos solo para el usuario del despliegue, y nunca en el repositorio.

---

### Historia de usuario 6 - Despliegue continuo con vuelta atrás (Prioridad: P3)

Cuando un cambio se fusiona en la rama principal y pasa los 5 controles, el sistema se actualiza solo
en el servidor: se preparan las imágenes nuevas, se aplican los cambios de la base de datos, se
actualizan las copias del servicio una a la vez sin cortar la atención y se comprueba que el
servicio responde sano. Si esa comprobación falla, el servidor vuelve a la versión anterior.

**Por qué esta prioridad**: es el criterio 12 del proyecto; depende de que exista el servidor
(historia 4).

**Prueba independiente**: fusionar un cambio pequeño y ver que el servidor lo tiene minutos después sin
cortes; simular una versión que no arranca y ver que el servidor sigue con la anterior.

**Escenarios de aceptación**:

1. **Dado** un cambio fusionado con los 5 controles en verde, **cuando** termina el flujo, **entonces**
   el servidor corre la versión nueva y la comprobación de salud responde sano.
2. **Dado** el despliegue en curso, **cuando** alguien usa el sistema, **entonces** no ve cortes: siempre
   hay al menos una copia del servicio atendiendo.
3. **Dado** una versión nueva que no pasa la comprobación de salud, **cuando** termina el flujo,
   **entonces** el servidor vuelve a la versión anterior y el flujo queda en rojo.
4. **Dado** los secretos del despliegue (llave de acceso, dirección y secretos de la aplicación),
   **cuando** se revisa el repositorio y los registros del flujo, **entonces** no aparecen; solo están
   en los secretos del repositorio remoto y en la configuración del servidor.
5. **Dado** que un control obligatorio falla en la rama principal, **cuando** termina, **entonces** no
   se despliega nada.

---

### Historia de usuario 7 - Medición de calidad en producción y datos de demostración (Prioridad: P3)

Con el sistema publicado, se mide desde otra máquina el rendimiento con 100 y 1,000 usuarios
simultáneos y el comportamiento en picos con una y con dos copias del servicio; se revisa la
seguridad con un escaneo automático, la accesibilidad en celular, el TLS y las cabeceras de
seguridad; y queda preparado el cuestionario de usabilidad para aplicarlo a 5 personas. Para la
presentación, un comando crea en el servidor usuarios de cada rol con contraseñas generadas que se
muestran una sola vez, y algunos expedientes de ejemplo.

**Por qué esta prioridad**: cierra los criterios 13 y los escenarios EQ-01, EQ-02, EQ-04 y EQ-05;
depende del servidor.

**Prueba independiente**: ejecutar la medición de carga a pedido y ver los resultados guardados;
ejecutar el comando de datos de demostración y entrar con cada rol.

**Escenarios de aceptación**:

1. **Dado** el sistema publicado, **cuando** se ejecuta la medición de carga a pedido, **entonces** queda
   un informe guardado con el percentil 95 y la tasa de errores para 100 y 1,000 usuarios, y la
   comparación de 1 y 2 copias del servicio.
2. **Dado** el escaneo de seguridad contra la dirección pública, **cuando** termina, **entonces** no hay
   alertas altas ni medias.
3. **Dado** las pantallas principales en modo celular, **cuando** se revisa la accesibilidad, **entonces**
   el puntaje es de 90 o más.
4. **Dado** el cuestionario de usabilidad preparado, **cuando** la usuaria lo aplica a 5 personas,
   **entonces** tiene la plantilla y la forma de calcular el puntaje; el resultado lo agrega ella.
5. **Dado** el comando de datos de demostración, **cuando** se ejecuta en el servidor, **entonces** crea un
   usuario por rol con una contraseña generada que aparece una sola vez en la terminal y nunca queda
   en archivos del repositorio ni en registros; si se ejecuta de nuevo, no duplica nada.

---

### Casos límite

- Rango de fechas con "desde" posterior a "hasta", con fechas inválidas o de más de 366 días: el
  tablero lo rechaza con un mensaje claro y no consulta nada.
- Un expediente que todavía no terminó su atención no entra en el promedio ni en el porcentaje dentro
  del plazo, pero sí en el conteo por estado.
- Un tipo de licencia con plazo de 0 días o sin expedientes atendidos en el rango: se muestra sin
  promedio ("sin datos") en lugar de dividir entre cero.
- Los días en que el plazo estuvo suspendido (observado o esperando pago) no se cuentan como tiempo
  de atención de la Municipalidad.
- Montos: la suma se hace al céntimo exacto, sin redondeos acumulados; un pago corregido cuenta una
  sola vez con su monto.
- Consulta pesada repetida varias veces seguidas: se reutiliza el resultado por pocos minutos; si la
  caché no está disponible, el tablero sigue funcionando consultando directo, solo más lento.
- CSV con giros o nombres que contienen comas, comillas, saltos de línea o empiezan con "=", "+", "-"
  o "@": el archivo se escapa para que la hoja de cálculo no lo interprete como fórmula.
- Reporte muy grande: se limita a 5,000 filas y se avisa si hay más para que se ajusten los filtros.
- El certificado de HTTPS no se puede obtener (por ejemplo, el servicio de nombres gratuito no
  responde): el sistema no queda publicado sin cifrado; el problema se ve en los registros del punto
  de entrada y la guía explica qué revisar.
- La copia de seguridad falla (disco lleno, base caída): el error queda registrado y la copia de ayer
  no se borra hasta que haya una nueva correcta.
- El despliegue se interrumpe a la mitad (se corta la conexión): la próxima ejecución lo completa y el
  servidor nunca queda sin ninguna copia del servicio atendiendo.
- Un cambio de la base de datos que no es compatible con la versión anterior del servicio: las
  migraciones se escriben compatibles hacia atrás para que la vuelta atrás no rompa nada.
- El servidor de 2 GB se queda sin memoria con dos copias del servicio, la base, la caché y el
  concentrador: cada contenedor tiene un límite de memoria y la guía indica cómo vigilarlo.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Tablero (historia 1)**

- **FR-001**: El sistema DEBE ofrecer a la jefatura (y solo a ella) un tablero con un rango de fechas
  "desde" y "hasta" inclusivo, en hora de Lima, que por defecto es el mes actual (del día 1 a hoy).
- **FR-002**: El tablero DEBE mostrar la cantidad de expedientes por estado, contando los expedientes
  presentados dentro del rango y su estado actual.
- **FR-003**: El tablero DEBE mostrar, por tipo de licencia, el plazo del TUPA en días hábiles, el
  promedio de días hábiles de atención y el porcentaje de expedientes atendidos dentro del plazo,
  considerando los expedientes cuya atención terminó dentro del rango. La atención se cuenta desde la
  presentación hasta la decisión final (aprobación, licencia emitida o denegación), en días hábiles
  según el calendario de feriados, sin contar los días en que el plazo estuvo suspendido.
- **FR-004**: El tablero DEBE mostrar el total recaudado en caja y el monto por tipo de licencia de los
  pagos registrados dentro del rango, exactos al céntimo, en soles.
- **FR-005**: Cada gráfico del tablero DEBE tener un texto alternativo que resuma los datos y una tabla
  con los mismos valores, y el tablero DEBE poder usarse a 360 px sin desplazamiento horizontal.
- **FR-006**: El sistema DEBE rechazar rangos inválidos (fechas mal escritas, "desde" posterior a
  "hasta" o más de 366 días) con un error de validación comprensible.
- **FR-007**: Los cálculos del tablero (promedios en días hábiles, porcentajes y sumas en soles) DEBEN
  hacerse con reglas puras y probadas, reutilizando el calendario de días hábiles existente.

**Reporte de licencias (historia 2)**

- **FR-008**: El sistema DEBE ofrecer a la jefatura un reporte por situación: licencias vigentes,
  expedientes en trámite y licencias con el certificado ITSE que vence en 30 días o menos, con
  filtros opcionales por tipo de licencia, giro y zona.
- **FR-009**: Cada fila DEBE tener número (de licencia o de expediente), tipo de licencia, titular
  público abreviado, giro, zona, estado y fecha (emisión, presentación o vencimiento del ITSE, según
  la situación).
- **FR-010**: El reporte DEBE poder descargarse en CSV separado por punto y coma, en UTF-8 con BOM y
  fin de línea CRLF (para que las hojas de cálculo en español lo abran con tildes y eñes correctas),
  con fechas AAAA-MM-DD, las mismas filas que en pantalla y los valores escapados para que ninguno se
  interprete como fórmula.
- **FR-011**: El reporte DEBE limitarse a 5,000 filas e indicar cuando hay más.
- **FR-012**: El tablero, el reporte y el CSV NO DEBEN incluir documento, RUC, celular, correo ni
  dirección del titular; el titular se muestra solo con su nombre público abreviado.

**Fuentes de los datos y caché (historias 1 y 2)**

- **FR-013**: El tablero y el reporte DEBEN obtener los datos únicamente a través de las entradas
  públicas de los módulos de trámites, pagos, licencias y plazos, sin leer directamente los datos
  internos de esos módulos.
- **FR-014**: El resultado de una consulta del tablero o del reporte DEBE reutilizarse durante 5
  minutos para la misma combinación de parámetros; si la caché no está disponible, el sistema DEBE
  responder igual consultando directo.
- **FR-015**: Las respuestas del tablero y del reporte DEBEN indicar al navegador que no las guarde.

**Pruebas de extremo a extremo (historia 3)**

- **FR-016**: Debe existir un conjunto de pruebas en navegador real que haga el recorrido completo de
  la ruta A (asistente, identidad con código, solicitud con documentos, confirmación del riesgo,
  pago en caja, aprobación, licencia emitida y verificación pública por QR) y de la ruta B hasta la
  inspección favorable y la licencia emitida.
- **FR-017**: Esas pruebas DEBEN correr en tamaño celular y de escritorio, en la integración continua,
  contra el sistema levantado en el entorno de pruebas, en un flujo propio que se ejecuta en cada pull
  request y en cada push a la rama principal, sin agregarse ni cambiar los nombres de los 5 controles
  obligatorios.
- **FR-018**: Las pruebas DEBEN leer el código de identidad directamente de la caché del entorno de
  pruebas; el servicio NO DEBE tener ningún endpoint para leer códigos, ni en pruebas ni en
  producción.

**Producción (historias 4 y 5)**

- **FR-019**: Debe existir una configuración de producción que levante, con un solo comando, un punto
  de entrada con HTTPS automático, el portal, dos copias del servicio con reparto del tráfico, la
  base de datos, la caché y el concentrador de conexiones, todos con reinicio automático y
  comprobación de salud.
- **FR-020**: En producción, solo los puertos 80 y 443 DEBEN quedar abiertos al exterior (más el de
  administración remota para el despliegue); la base de datos, la caché, el concentrador y el
  servicio NO DEBEN publicarse fuera del servidor.
- **FR-021**: La dirección pública DEBE salir de un único valor de configuración (el dominio); sin
  dominio propio, ese valor es la IP del servidor con un servicio de nombres gratuito que permite un
  certificado válido. HTTP DEBE redirigir a HTTPS y el TLS DEBE ser 1.3 (constitución, principio VII).
- **FR-022**: El punto de entrada DEBE servir los archivos del portal con huella en el nombre con caché
  inmutable de 1 año, la página principal sin caché, respetar las cabeceras de caché que ya define
  cada respuesta del servicio y comprimir las respuestas de texto.
- **FR-023**: El punto de entrada DEBE agregar las cabeceras de seguridad (HSTS, política de contenido,
  sin rastreo de referencia, sin incrustación en otros sitios y sin adivinar tipos de contenido) y
  pasar al servicio la IP real del visitante para los límites de intentos.
- **FR-024**: Las copias del servicio DEBEN conectarse a la base de datos a través de un concentrador de
  conexiones en modo por transacción, con un tope fijo de conexiones hacia la base.
- **FR-025**: DEBE hacerse una copia de seguridad comprimida de la base de datos cada día, conservando
  las de los últimos 7 días en el servidor, fuera de los contenedores y con permisos solo del usuario
  del despliegue; una copia fallida no borra las anteriores. La guía DEBE explicar cómo bajar una
  copia a la computadora de la usuaria al menos una vez por semana.
- **FR-026**: DEBE existir un procedimiento de restauración documentado y probado al menos una vez, con
  el comando y el resultado comparado (cantidad de expedientes, pagos, licencias y auditorías).
- **FR-027**: Cada contenedor de producción DEBE tener un límite de memoria que en conjunto quepa en un
  servidor de 2 GB.
- **FR-028**: La configuración de producción DEBE traer un archivo de ejemplo con solo los nombres de
  las variables, nunca valores secretos.

**Guías y decisiones (historias 4, 5 y 6)**

- **FR-029**: Debe existir una guía paso a paso para la usuaria, en lenguaje sencillo, con el comando
  exacto de cada paso: crear el servidor, crear la llave de acceso desde Windows, configurar el
  cortafuegos, instalar los contenedores, crear el usuario del despliegue, cargar los secretos en el
  repositorio remoto y hacer el primer despliegue.
- **FR-030**: Debe existir una guía para cuando haya dominio: delegar el DNS a Cloudflare con proxy, CDN
  solo para los archivos del portal (nunca para el servicio ni la página principal), TLS "Full
  (strict)" y origen que solo acepta conexiones de Cloudflare, indicando qué parte quedó pendiente
  por no tener dominio.
- **FR-031**: ADR-008 (réplica de la base con conmutación automática) y ADR-010 (DNS, CDN y TLS) DEBEN
  actualizarse con lo implementado y lo que queda como siguiente paso, con el motivo (un solo
  servidor de 2 GB, sin dominio).

**Despliegue continuo (historia 6)**

- **FR-032**: Cuando la rama principal pasa los 5 controles, un flujo automático DEBE construir las
  imágenes del servicio y del portal, publicarlas en el registro de imágenes del repositorio,
  entrar al servidor, aplicar las migraciones, actualizar las copias del servicio una a la vez y
  comprobar la salud.
- **FR-033**: Si la comprobación de salud después del despliegue falla, el flujo DEBE volver a las
  imágenes anteriores y terminar en rojo; las migraciones ya aplicadas se mantienen (por eso FR-035).
- **FR-034**: Los secretos del despliegue DEBEN guardarse solo en los secretos del repositorio remoto y
  en la configuración del servidor; NO DEBEN aparecer en el repositorio ni en los registros del flujo.
- **FR-035**: Las migraciones de la base de datos DEBEN ser compatibles con la versión anterior del
  servicio durante el despliegue (agregar antes de quitar), para que la vuelta atrás no rompa nada.
  La regla queda escrita en la guía de despliegue y en la plantilla de PR, y una revisión automática
  avisa si una migración nueva borra o renombra columnas o tablas.

**Medición y demostración (historia 7)**

- **FR-036**: Debe existir una medición de carga que se ejecute a pedido desde otra máquina contra la
  dirección pública: consulta del catálogo y del estado con 100 y 1,000 usuarios (EQ-01) y picos con 1
  y 2 copias del servicio (EQ-02), con los resultados guardados.
- **FR-037**: Debe existir la forma de ejecutar el escaneo de seguridad, la revisión de accesibilidad en
  celular de las pantallas principales y la comprobación de TLS y de cabeceras contra la dirección
  pública, con los resultados resumidos en el README.
- **FR-038**: Debe quedar preparado el cuestionario SUS para 5 personas: plantilla, instrucciones y
  cálculo del puntaje.
- **FR-039**: Debe existir un comando para el servidor que cree un usuario por rol con una contraseña
  generada al azar, mostrada una sola vez en la terminal, y algunos expedientes de ejemplo con datos
  ficticios; ejecutarlo de nuevo no duplica nada.

**Documentación final**

- **FR-040**: El README DEBE indicar la dirección pública, cómo desplegar, los resultados de las
  mediciones y el estado de los 16 criterios del proyecto; el diagrama de casos de uso DEBE marcar
  CU20 y CU22 como hechos.

### Entidades clave

- **Indicadores del tablero**: resultado calculado para un rango de fechas: conteo por estado, por tipo
  de licencia el plazo del TUPA, el promedio de días hábiles y el porcentaje dentro del plazo, e
  ingresos (total y por tipo de licencia). No se guarda; se calcula y se reutiliza por 5 minutos.
- **Fila del reporte**: número, tipo de licencia, titular público, giro, zona, estado y fecha. No se
  guarda.
- **Atención de un expediente** (dato que entrega el módulo de trámites): número, tipo de licencia,
  fecha de presentación, fecha de la decisión final y días hábiles suspendidos.
- **Pago registrado** (dato que entrega el módulo de pagos): tipo de licencia, monto y fecha de
  registro.
- **Copia de seguridad**: archivo comprimido con la fecha en el nombre, fuera de los contenedores, con
  retención de 7 días.
- **Configuración de producción**: dominio, secretos de la aplicación y de la base, tamaño del
  concentrador y límites de memoria; solo en el servidor.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: La jefatura ve el tablero del mes actual en 3 segundos o menos desde que abre la página,
  con hasta 10,000 expedientes en la base.
- **SC-002**: Los conteos, promedios, porcentajes y montos del tablero coinciden al 100 % con los
  calculados a mano sobre los datos sembrados en las pruebas (montos al céntimo).
- **SC-003**: El 100 % de los intentos de ver el tablero o el reporte sin sesión o sin el rol de
  jefatura se rechazan sin mostrar datos.
- **SC-004**: El tablero, el reporte y el CSV no contienen ningún documento, RUC, celular, correo ni
  dirección del titular en el 100 % de las pruebas.
- **SC-005**: Los recorridos de extremo a extremo de las rutas A y B pasan en tamaño celular y de
  escritorio en la integración continua.
- **SC-006**: Desde fuera del servidor solo responden los puertos web (y el de administración remota);
  la comprobación queda documentada con el comando y su salida.
- **SC-007** (EQ-01): Con 1,000 usuarios simultáneos consultando el catálogo y el estado del trámite,
  el 95 % de las respuestas llega en 2 segundos o menos con menos del 1 % de errores.
- **SC-008** (EQ-02): La prueba de picos se ejecuta con 1 y con 2 copias del servicio y queda
  documentada la comparación (peticiones por segundo, percentil 95 y errores). Con 2 copias los
  errores son menos del 1 % hasta 1,000 usuarios. Si el servidor de 2 GB tiene un solo procesador y
  las 2 copias no mejoran el rendimiento, se documenta ese límite y el beneficio que sí dan: seguir
  atendiendo cuando una cae y actualizar sin cortes.
- **SC-009** (EQ-03): Al detener una copia del servicio, las consultas siguen respondiendo y el sistema
  se recupera solo en 5 minutos o menos; una copia de seguridad restaurada conserva el 100 % de los
  pagos registrados hasta el momento de la copia.
- **SC-010** (EQ-04): El escaneo de seguridad contra la dirección pública no tiene alertas altas ni
  medias, solo se acepta TLS 1.3 y están todas las cabeceras de seguridad.
- **SC-011** (EQ-05): Las pantallas principales en modo celular tienen un puntaje de accesibilidad de
  90 o más, y el cuestionario SUS queda listo para aplicarse a 5 personas.
- **SC-012**: Un cambio fusionado en la rama principal llega al servidor en 15 minutos o menos sin que
  la comprobación de salud deje de responder durante el despliegue; una versión que no arranca se
  revierte sola.
- **SC-013**: Ningún secreto aparece en el repositorio ni en los registros (revisión automática de
  secretos sin hallazgos).

## Supuestos

- La usuaria crea el servidor, la llave de acceso y los secretos del repositorio siguiendo la guía;
  el desarrollo deja todo preparado y probado localmente, y las mediciones contra la dirección
  pública (carga, escaneo de seguridad, accesibilidad en producción, TLS) se ejecutan cuando el
  servidor exista. Hasta entonces, sus resultados quedan como pendientes en el README.
- El "tiempo de atención" mide el trabajo de la Municipalidad: va de la presentación a la decisión
  final y descuenta los días con el plazo suspendido (observado o esperando pago), igual que el reloj
  de plazos de la 006.
- El conteo por estado usa los expedientes presentados en el rango (con su estado de hoy); los
  ingresos usan la fecha de registro del pago; el tiempo de atención usa la fecha de la decisión
  final.
- La medida de EQ-02 con 10,000 usuarios no es alcanzable en un servidor de 2 GB; se mide la mejora
  entre 1 y 2 copias del servicio y se documenta el límite, como pidió la usuaria.
- La réplica con conmutación automática (Patroni) no se pone en marcha porque hay un solo servidor; la
  disponibilidad de EQ-03 se cubre con dos copias del servicio, reinicio automático y copias de
  seguridad diarias.
- Sin dominio propio no hay CDN; la caché del navegador y la compresión cubren el criterio 11 hasta
  que se compre el dominio.
- Los correos y SMS siguen simulados y los servicios de DNI y RUC siguen siendo los simulados de las
  funcionalidades anteriores.
- El monitoreo con paneles (Grafana, Prometheus, Uptime Kuma) queda fuera de esta funcionalidad; la
  comprobación de salud del sistema y los registros de los contenedores sirven de base.
