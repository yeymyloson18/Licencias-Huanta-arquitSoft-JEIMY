# Especificación de funcionalidad: Inspección ITSE, licencia con QR, plazos en días hábiles y avisos

**Rama de la funcionalidad**: `006-itse-licencia-plazos`

**Creada**: 2026-11-20

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/006-itse-licencia-plazos.md"
(Funcionalidad 006: Inspección ITSE, licencia con QR, plazos en días hábiles y avisos. Como inspector
ITSE quiero registrar el resultado de la inspección con fotos desde mi celular, para que el expediente
avance sin papel. Como administrado quiero recibir mi licencia digital con código QR, para demostrar
su validez en cualquier momento, y que cualquiera pueda verificarla. Como administrador quiero
registrar los feriados del año, para que los plazos se cuenten bien en días hábiles. Como jefatura
quiero ver los expedientes cuyo plazo está por vencer y asignar inspectores, para cumplir los plazos
del TUPA. Como administrado quiero recibir avisos de cada avance de mi trámite y antes de que venza mi
certificado ITSE.)

**Cubre**: HU08, HU06, HU16, HU09 y HU11; RF08, RF10, RF13, RF14, RF20, RF23 y RF25 (para ITSE y
emisión de licencias); casos de uso CU08, CU09, CU10, CU15, CU17, CU18, CU19 y CU25; ADR-005 (eventos
en una cola de la base de datos), ADR-006 (reloj de plazos con una sola ejecución aunque haya varias
copias del sistema) y ADR-007 (verificación pública con datos mínimos). Issues de GitHub: #11 (HU08),
#9 (HU06), #19 (HU16), #12 (HU09) y #14 (HU11). Une la 007 (ITSE), la 008 (plazos y avisos) y la parte
de licencia de la 009 del plan original. Usa los expedientes de la 004, la evaluación y el pago de la
005, el catálogo de la 003 (ruta, orden del ITSE, vigencia y plazo) y la seguridad de la 002.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Emitir la licencia con QR y verificarla (Prioridad: P1)

Cuando el evaluador aprueba un expediente pagado de ruta A, el sistema emite la licencia definitiva
con su código QR; en la ruta C (bodega), la licencia provisional de 12 meses. El administrado descarga
el PDF de su licencia desde la consulta pública, y cualquier persona que escanee el QR ve una página
pública con los datos mínimos que prueban que la licencia es válida.

**Por qué esta prioridad**: la licencia es el resultado que el administrado espera del trámite (HU06,
RF13) y cierra el recorrido de las rutas A y C que la 005 deja en APROBADO.

**Prueba independiente**: aprobar un expediente pagado de ruta A, comprobar que aparece la licencia
`LF-AAAA-NNNNNN`, descargar el PDF desde la consulta pública, abrir la dirección del QR en otro
navegador sin sesión y ver los datos mínimos sin documento ni dirección del titular.

**Escenarios de aceptación**:

1. **Dado** un expediente PAGADO de ruta A, **cuando** el evaluador lo aprueba, **entonces** se emite
   una licencia DEFINITIVA con número único y código de verificación, el expediente pasa a
   LICENCIA_EMITIDA y luego a ITSE_POSTERIOR_PENDIENTE, y se crea una inspección POSTERIOR pendiente.
2. **Dado** un expediente PAGADO de ruta C, **cuando** el evaluador lo aprueba, **entonces** se emite
   una licencia PROVISIONAL vigente 12 meses (la vigencia de la receta), el expediente pasa a
   LICENCIA_PROVISIONAL y se crea una inspección BODEGA pendiente.
3. **Dado** un expediente con licencia emitida, **cuando** el administrado consulta su expediente con
   el número y su documento, **entonces** ve el número de licencia y puede descargar el PDF, que trae
   el código QR, el tipo, el giro, la zona, el nombre comercial, el titular público y las fechas.
4. **Dado** el código de verificación de una licencia, **cuando** cualquier persona abre la página de
   verificación, **entonces** ve número, tipo, estado, giro, zona, nombre comercial, titular público,
   fecha de emisión, vigencia y estado del certificado ITSE, y nunca el documento, el RUC, el
   celular, el correo ni la dirección del titular.
5. **Dado** un código que no existe, **cuando** se abre la página de verificación, **entonces**
   responde "no encontrada" sin pistas sobre códigos parecidos; tras 10 códigos inexistentes desde el
   mismo origen en 15 minutos, se bloquea por un tiempo.
6. **Dado** un expediente que ya tiene una licencia vigente, **cuando** se intenta emitir otra (por
   ejemplo, por un aviso repetido), **entonces** no se crea una segunda licencia.

---

### Historia de usuario 2 - Asignar inspectores y registrar el resultado ITSE (Prioridad: P1)

La jefatura ve las inspecciones pendientes y asigna a cada una un inspector y una fecha. El inspector
ve en su celular solo las inspecciones que le tocan y, en el local, registra el resultado (favorable o
desfavorable), sus observaciones y de 1 a 5 fotos tomadas con la cámara. Según la ruta, el expediente
avanza: en la ruta B, con resultado favorable se emite la licencia; con desfavorable, se deniega.

**Por qué esta prioridad**: sin la inspección la ruta B no termina nunca (HU08, RF10) y es la que
permite emitir la licencia de riesgo alto y muy alto.

**Prueba independiente**: con un expediente de ruta B ya pagado, comprobar que está EN_INSPECCION con
una inspección PREVIA pendiente; como jefatura asignarla a un inspector; como ese inspector registrar
un resultado favorable con dos fotos y el certificado ITSE; comprobar la licencia emitida y el
expediente FINALIZADO.

**Escenarios de aceptación**:

1. **Dado** un expediente de ruta B, **cuando** se registra su pago, **entonces** el expediente pasa
   de PAGADO a EN_INSPECCION y se crea una inspección PREVIA pendiente.
2. **Dado** inspecciones pendientes, **cuando** la jefatura abre la bandeja de inspecciones,
   **entonces** ve todas, con número de expediente, tipo, licencia, estado e inspector asignado, y
   puede asignar un usuario con rol INSPECTOR y una fecha programada (o cambiar el inspector mientras
   no haya resultado).
3. **Dado** un inspector, **cuando** abre su bandeja, **entonces** ve solo las inspecciones asignadas
   a él, en una vista pensada para el celular.
4. **Dado** una inspección asignada, **cuando** su inspector registra FAVORABLE con observaciones,
   de 1 a 5 fotos JPG o PNG de hasta 10 MB y el número y la fecha de emisión del certificado ITSE,
   **entonces** queda registrada una sola vez con su auditoría, el certificado vence 2 años después y
   el expediente avanza según su ruta.
5. **Dado** una inspección PREVIA (ruta B), **cuando** el resultado es FAVORABLE, **entonces** se emite
   la licencia DEFINITIVA con su certificado ITSE y el expediente pasa a LICENCIA_EMITIDA y luego a
   FINALIZADO; **cuando** es DESFAVORABLE, el expediente pasa a DENEGADO con las observaciones como
   motivo.
6. **Dado** una inspección POSTERIOR (ruta A), **cuando** el resultado es FAVORABLE, **entonces** se
   registra el certificado ITSE en la licencia y el expediente pasa a FINALIZADO; **cuando** es
   DESFAVORABLE, pasa a DERIVADO_A_FISCALIZACION y la licencia no se anula aquí.
7. **Dado** una inspección ya registrada, **cuando** se intenta registrar otra vez, **entonces**
   responde que ya tiene resultado (conflicto) sin cambiar nada; **dado** un inspector que no es el
   asignado, **cuando** intenta registrar, **entonces** no tiene permiso.
8. **Dado** un archivo que no es una imagen JPG o PNG real (aunque tenga esa extensión), más de 5
   fotos, ninguna foto o una foto de más de 10 MB, **cuando** se registra el resultado, **entonces**
   se rechaza con un mensaje claro y no se guarda nada.

---

### Historia de usuario 3 - Feriados y plazos en días hábiles (Prioridad: P2)

El administrador registra los feriados del año (nacionales, regionales o locales). Con ellos, el
sistema cuenta los plazos en días hábiles: calcula la fecha de vencimiento de cada expediente al
presentarlo, la suspende mientras el expediente está observado y la reanuda al subsanar, y fija el
plazo para subsanar.

**Por qué esta prioridad**: los plazos del TUPA están en días hábiles (HU16, RF23, RF08); sin ellos
no hay alertas confiables, pero el recorrido de la licencia funciona sin ellos.

**Prueba independiente**: registrar un feriado un miércoles, presentar un expediente de 2 días
hábiles el martes anterior y comprobar que vence el viernes; observarlo y subsanarlo y comprobar que
el vencimiento se corre los días hábiles que estuvo observado.

**Escenarios de aceptación**:

1. **Dado** un administrador, **cuando** registra un feriado con fecha, descripción y alcance
   (NACIONAL, REGIONAL o LOCAL), **entonces** aparece en la lista del año; una fecha repetida se
   rechaza; puede eliminar un feriado.
2. **Dado** el sistema recién instalado, **cuando** se consulta la lista de 2026, **entonces** ya
   están los feriados nacionales de Perú de 2026.
3. **Dado** un expediente que se presenta, **cuando** se registra, **entonces** su fecha de
   vencimiento es la fecha de presentación más los días hábiles del plazo de su receta, sin contar
   sábados, domingos ni feriados registrados.
4. **Dado** expedientes ya presentados sin fecha de vencimiento (de la 004 y la 005), **cuando** el
   sistema se actualiza, **entonces** se les calcula una sola vez.
5. **Dado** un expediente que se observa, **cuando** se registra la observación, **entonces** el plazo
   para subsanar es de 2 días hábiles y el plazo del expediente queda suspendido; **cuando** se
   subsana, el vencimiento se corre tantos días hábiles como los que quedaban al observarlo.
6. **Dado** un plazo que cruza el fin de año o un fin de semana largo con feriados, **cuando** se
   calcula, **entonces** el resultado es correcto.

---

### Historia de usuario 4 - Alertas de plazos para la jefatura (Prioridad: P2)

Un reloj del sistema revisa periódicamente los expedientes en trámite y genera una alerta cuando a
uno le quedan 2 días hábiles o menos (o ya venció). La jefatura ve las alertas ordenadas por urgencia
y las marca como atendidas.

**Por qué esta prioridad**: cumplir los plazos del TUPA es la razón de HU09 y RF08; depende de la
historia 3.

**Prueba independiente**: con un expediente EN_EVALUACION que vence en 1 día hábil, ejecutar el reloj
dos veces (y en dos copias del sistema a la vez) y comprobar que hay una sola alerta; entrar como
jefatura a la página de alertas, verla primero en la lista y marcarla como atendida.

**Escenarios de aceptación**:

1. **Dado** un expediente en trámite al que le quedan 2 días hábiles o menos, **cuando** corre el
   reloj, **entonces** se genera una alerta con los días hábiles restantes.
2. **Dado** que el reloj corre varias veces o en varias copias del sistema a la vez, **cuando**
   termina, **entonces** hay exactamente una alerta por expediente y fecha de vencimiento (ni cero ni
   duplicadas).
3. **Dado** alertas, **cuando** la jefatura abre la página de alertas, **entonces** las ve de la más
   urgente a la menos urgente (las vencidas primero), con número de expediente, estado, vencimiento y
   días restantes, y puede marcar cada una como atendida.
4. **Dado** un expediente observado, esperando el pago, finalizado, denegado o con la licencia ya
   emitida, **cuando** corre el reloj, **entonces** no genera alerta.

---

### Historia de usuario 5 - Avisos al administrado (Prioridad: P3)

Por cada cambio de estado de su expediente, el administrado recibe un aviso corto (por correo si lo
dio, si no por SMS) que le dice en qué estado está y qué sigue. Además, 30 días antes de que venza su
certificado ITSE recibe un aviso, una sola vez. Mientras la Municipalidad no contrate el servicio de
correo o SMS, los avisos se simulan.

**Por qué esta prioridad**: mejora la experiencia (RF20, RF14, HU11), pero el trámite funciona sin
avisos porque la consulta pública ya muestra el estado.

**Prueba independiente**: aprobar un expediente de ruta A y comprobar que se crearon los avisos de
cada cambio de estado, sin documento ni dirección; registrar un certificado ITSE que vence en 29 días
y comprobar que el reloj envía un solo aviso de vencimiento aunque corra varias veces.

**Escenarios de aceptación**:

1. **Dado** un cambio de estado del expediente, **cuando** se procesa, **entonces** se crea un aviso
   con el número de expediente y el estado en lenguaje sencillo, y se envía; el destinatario se guarda
   protegido y el aviso no lleva documento, dirección ni enlaces con datos personales.
2. **Dado** un envío que falla, **cuando** pasa el tiempo de espera, **entonces** se reintenta (hasta
   5 intentos) y, si sigue fallando, queda marcado como fallido.
3. **Dado** un certificado ITSE que vence dentro de 30 días o menos, **cuando** corre el reloj,
   **entonces** se envía un aviso de vencimiento una sola vez por certificado.
4. **Dado** que el mismo cambio de estado llega dos veces, **cuando** se procesa, **entonces** se crea
   un solo aviso.

---

### Casos límite

- Aprobar un expediente de ruta B: no corresponde (la ruta B termina con la inspección, como en la
  005).
- Un aviso de "licencia por emitir" que llega dos veces: una sola licencia (una vigente por
  expediente).
- Una inspección POSTERIOR con resultado desfavorable: el expediente pasa a DERIVADO_A_FISCALIZACION
  y la licencia sigue vigente (la anulación es de otra funcionalidad).
- Inspección BODEGA (ruta C): favorable registra el certificado ITSE y el expediente sigue con su
  licencia provisional; desfavorable lo deriva a fiscalización. La licencia definitiva de bodega es
  trabajo futuro.
- Asignar a un usuario que no tiene rol INSPECTOR o está inactivo: se rechaza.
- Asignar con una fecha programada pasada: se rechaza.
- Registrar resultado de una inspección sin asignar: no tiene permiso ningún inspector.
- Foto con extensión .jpg que en realidad es un PDF: se rechaza por el contenido.
- Feriado repetido: se rechaza; eliminar un feriado que no existe: no encontrado.
- Feriado registrado después de calcular un vencimiento: los vencimientos ya calculados no cambian;
  los nuevos cálculos sí lo consideran.
- Plazo de 0 días o receta sin plazo: sin vencimiento y sin alertas.
- Verificar un código con letras en otro formato o de otro largo: "no encontrada", igual que un código
  inexistente.
- El reloj se cae a la mitad: la siguiente ejecución completa lo que faltó sin duplicar.
- Administrado sin correo: el aviso va por SMS al celular.
- Licencia provisional vencida: la verificación muestra su estado VENCIDA (cuando la fecha de
  vigencia ya pasó).

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Recorrido por ruta**

- **FR-001**: Al aprobar un expediente PAGADO de ruta A, el sistema MUST emitir la licencia
  DEFINITIVA, pasar el expediente a LICENCIA_EMITIDA y luego a ITSE_POSTERIOR_PENDIENTE, y crear una
  inspección POSTERIOR pendiente.
- **FR-002**: Al registrarse el pago de un expediente de ruta B, el sistema MUST pasarlo de PAGADO a
  EN_INSPECCION y crear una inspección PREVIA pendiente.
- **FR-003**: Al aprobar un expediente PAGADO de ruta C, el sistema MUST emitir la licencia
  PROVISIONAL con la vigencia en meses de la receta guardada (12), pasar el expediente a
  LICENCIA_PROVISIONAL y crear una inspección BODEGA pendiente.
- **FR-004**: Con resultado FAVORABLE de una inspección PREVIA, el sistema MUST emitir la licencia
  DEFINITIVA con su certificado ITSE y pasar el expediente a LICENCIA_EMITIDA y luego a FINALIZADO;
  con DESFAVORABLE, MUST pasarlo a DENEGADO con las observaciones como motivo.
- **FR-005**: Con resultado FAVORABLE de una inspección POSTERIOR, el sistema MUST registrar el
  certificado ITSE en la licencia vigente y pasar el expediente a FINALIZADO; con DESFAVORABLE, MUST
  pasarlo a DERIVADO_A_FISCALIZACION sin anular la licencia.
- **FR-006**: Con resultado FAVORABLE de una inspección BODEGA, el sistema MUST registrar el
  certificado ITSE en la licencia provisional sin cambiar el estado del expediente; con DESFAVORABLE,
  MUST pasarlo a DERIVADO_A_FISCALIZACION.
- **FR-007**: Cada paso del recorrido MUST quedar en el historial del expediente y emitir un aviso de
  cambio de estado; los pasos que cruzan módulos MUST hacerse por la cola de eventos, de forma que
  repetir un aviso no duplique licencias, inspecciones ni cambios de estado.

**Inspecciones**

- **FR-008**: La jefatura MUST ver todas las inspecciones (filtrables por estado) y asignar a cada una
  sin resultado un usuario activo con rol INSPECTOR y una fecha programada que no sea pasada; puede
  cambiar la asignación mientras no haya resultado.
- **FR-009**: El inspector MUST ver solo las inspecciones asignadas a él.
- **FR-010**: Solo el inspector asignado MUST poder registrar el resultado (FAVORABLE o DESFAVORABLE),
  con observaciones (obligatorias si es desfavorable, hasta 2000 caracteres) y de 1 a 5 fotos JPG o
  PNG de hasta 10 MB cada una, cuyo tipo se comprueba por el contenido del archivo.
- **FR-011**: Con resultado FAVORABLE, el inspector MUST registrar el número del certificado ITSE y su
  fecha de emisión (no futura); el vencimiento MUST ser 2 años después de la emisión.
- **FR-012**: Una inspección MUST tener un solo resultado: un segundo registro MUST responder conflicto
  sin cambiar nada; las fotos se guardan con el mismo almacén de archivos de la 004.
- **FR-013**: Cada asignación y cada resultado MUST quedar en la auditoría de inspecciones con el
  usuario, la acción, el expediente y la fecha.

**Licencia y verificación**

- **FR-014**: Cada licencia MUST tener un número único `LF-AAAA-NNNNNN`, un código de verificación
  aleatorio de 22 caracteres que no se pueda adivinar, el tipo (DEFINITIVA o PROVISIONAL), el giro,
  la zona, el nombre comercial, el titular público, la fecha de emisión y la vigencia (indeterminada
  para la definitiva).
- **FR-015**: El titular público MUST ser la razón social si existe; si no, el nombre con los
  apellidos abreviados a su inicial (por ejemplo, "Juana P. Q."); nunca el documento.
- **FR-016**: Un expediente MUST tener como máximo una licencia vigente.
- **FR-017**: La licencia MUST tener un PDF con el código QR que apunta a la página pública de
  verificación, y sin documento, RUC, celular, correo ni dirección del titular.
- **FR-018**: La emisión MUST quedar en la auditoría de licencias, con usuario vacío si fue
  automática.
- **FR-019**: La página pública de verificación MUST mostrar sin cuenta solo número, tipo, estado
  (VIGENTE o VENCIDA según la fecha), giro, zona, nombre comercial, titular público, fecha de emisión,
  vigencia y estado del certificado ITSE (sin certificado, vigente o vencido).
- **FR-020**: Un código inexistente o mal formado MUST responder "no encontrada" con el mismo mensaje;
  tras 10 respuestas "no encontrada" desde el mismo origen en 15 minutos, la verificación MUST
  bloquearse para ese origen hasta que pase la ventana.
- **FR-021**: El administrado MUST poder descargar el PDF de su licencia desde la consulta pública de
  la 004 cuando el expediente está en LICENCIA_EMITIDA, LICENCIA_PROVISIONAL, ITSE_POSTERIOR_PENDIENTE,
  FINALIZADO o DERIVADO_A_FISCALIZACION, con un permiso de lectura que sirve solo para su expediente.
- **FR-022**: El personal (EVALUADOR, JEFATURA) MUST poder ver los datos de la licencia en el detalle
  del expediente y descargar su PDF.

**Feriados y plazos**

- **FR-023**: El administrador MUST poder listar por año, registrar (fecha, descripción de hasta 150
  caracteres y alcance NACIONAL, REGIONAL o LOCAL) y eliminar feriados; una fecha repetida MUST
  rechazarse.
- **FR-024**: El sistema MUST traer como datos iniciales los feriados nacionales de Perú de 2026.
- **FR-025**: El sistema MUST contar días hábiles excluyendo sábados, domingos y feriados registrados,
  para sumar días hábiles a una fecha y para calcular los días hábiles que faltan hasta una fecha.
- **FR-026**: Al presentar un expediente, el sistema MUST calcular su vencimiento con el plazo en días
  hábiles de la receta guardada; los expedientes existentes sin vencimiento MUST completarse una vez.
- **FR-027**: Al observar un expediente, el plazo para subsanar MUST ser de 2 días hábiles y el plazo
  del expediente MUST suspenderse; al subsanar, el vencimiento MUST correrse los días hábiles que
  quedaban al observar.

**Reloj y alertas**

- **FR-028**: Una tarea periódica MUST generar una alerta cuando a un expediente en trámite (REGISTRADO,
  EN_EVALUACION, PAGADO, EN_INSPECCION o APROBADO) le quedan 2 días hábiles o menos, incluidos los ya
  vencidos.
- **FR-029**: Aunque la tarea corra varias veces o en varias copias del sistema a la vez, MUST haber una
  sola ejecución a la vez y una sola alerta por expediente y fecha de vencimiento.
- **FR-030**: La jefatura MUST ver las alertas sin atender de la más urgente a la menos urgente y poder
  marcar cada una como atendida (queda quién y cuándo).

**Avisos**

- **FR-031**: Por cada cambio de estado del expediente, el sistema MUST crear un aviso para el titular
  (por correo si lo registró; si no, por SMS al celular) y enviarlo; un mismo cambio repetido MUST
  producir un solo aviso.
- **FR-032**: Los avisos MUST decir el número de expediente, el estado en lenguaje sencillo y qué
  sigue, sin documento, RUC, dirección ni enlaces con datos personales; el destinatario MUST guardarse
  protegido (cifrado).
- **FR-033**: Un envío fallido MUST reintentarse con espera creciente hasta 5 intentos; después queda
  como fallido.
- **FR-034**: El reloj MUST enviar un aviso cuando a un certificado ITSE le quedan 30 días o menos para
  vencer, una sola vez por certificado.
- **FR-035**: Mientras no haya servicio de correo o SMS contratado, el envío MUST simularse dejando el
  aviso disponible para revisarlo en desarrollo durante un tiempo limitado.

**Permisos, auditoría y privacidad**

- **FR-036**: INSPECTOR registra resultados de sus inspecciones y ve las suyas; JEFATURA ve todas las
  inspecciones, asigna y ve y atiende alertas; ADMINISTRADOR gestiona feriados (todos pueden listarlos
  con sesión); la verificación del QR es pública. Cualquier otro rol MUST recibir "sin permiso" y sin
  sesión "no autenticado", sin cambiar datos.
- **FR-037**: Ningún registro del sistema, dirección de página, mensaje de error, evento, aviso,
  auditoría ni PDF MUST contener el documento, el RUC, el celular, el correo ni la dirección del
  titular.

### Entidades clave

- **Inspección**: una por expediente y tipo (PREVIA, POSTERIOR o BODEGA); estado (PENDIENTE, ASIGNADA,
  REALIZADA), inspector, fecha programada, resultado, observaciones y fecha de registro.
- **Foto de inspección**: imagen JPG o PNG de hasta 10 MB ligada a una inspección.
- **Licencia**: número `LF-AAAA-NNNNNN`, expediente, receta, tipo, datos públicos (giro, zona, nombre
  comercial, titular público), código de verificación, emisión, vigencia, estado y PDF.
- **Certificado ITSE**: número, licencia, fecha de emisión, vencimiento (2 años) y fecha del aviso de
  vencimiento.
- **Feriado**: fecha, descripción, alcance y quién lo registró.
- **Alerta de plazo**: expediente, vencimiento, días hábiles restantes, generada y atendida.
- **Aviso**: canal, destinatario protegido, plantilla, datos sin información personal, expediente,
  estado de envío, intentos y fechas.
- **Auditorías**: de inspecciones (asignar, registrar resultado) y de licencias (emitir, emitir
  provisional).

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Un inspector registra el resultado con dos fotos desde un celular (pantalla de 360 px)
  en 3 minutos o menos desde que abre su bandeja.
- **SC-002**: La jefatura asigna una inspección pendiente a un inspector en 1 minuto o menos desde que
  abre la bandeja de inspecciones.
- **SC-003**: Los recorridos completos de las rutas A (hasta FINALIZADO), B (hasta FINALIZADO y, con
  resultado desfavorable, DENEGADO) y C (hasta LICENCIA_PROVISIONAL) se completan en las pruebas sin
  intervención manual fuera de las acciones de las personas.
- **SC-004**: El 100 % de los casos de prueba de días hábiles (fines de semana, feriados, cruce de año
  y fines de semana largos) dan la fecha correcta.
- **SC-005**: Con el reloj ejecutándose en 2 copias del sistema a la vez, hay exactamente una alerta
  por expediente y vencimiento y un solo aviso por certificado ITSE por vencer.
- **SC-006**: La página de verificación muestra el resultado en 2 segundos o menos y en el 100 % de
  las verificaciones no aparece ningún dato personal del titular.
- **SC-007**: Cada operación nueva responde "no autenticado" sin sesión y "sin permiso" a cada rol que
  no corresponde, sin cambiar datos.
- **SC-008**: Ningún registro del sistema, aviso, evento, auditoría, PDF ni página pública contiene el
  documento, el RUC, el celular, el correo ni la dirección del titular.
- **SC-009**: Cada cambio de estado del expediente produce exactamente un aviso.

## Supuestos

- El plazo para subsanar es de 2 días hábiles, el plazo general del procedimiento administrativo
  (TUO de la Ley N.° 27444, numeral 136.2), porque la validación del TUPA (docs/01) no fija otro.
- La fecha de vencimiento se cuenta desde el día hábil siguiente a la presentación.
- Los feriados nacionales de 2026 se toman de la norma vigente; se verifican durante el plan.
- El servicio de correo y SMS real no está contratado: el envío se simula (como el código de la 004).
- La ruta de cada expediente es la de la receta confirmada en la 005.
- La renovación del certificado ITSE, la anulación de licencias por fiscalización, la licencia
  definitiva de bodega, el tablero y los reportes (007) y los trámites conectados (HU12) quedan fuera.
- Las pruebas de carga, Lighthouse y ZAP se hacen una sola vez en el despliegue (007).
