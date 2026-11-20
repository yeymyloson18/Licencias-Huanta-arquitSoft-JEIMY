# Especificación de funcionalidad: Evaluación del expediente, esquela de pago y pago en caja

**Rama de la funcionalidad**: `005-esquela-pago`

**Creada**: 2026-11-20

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/005-evaluacion-pago.md"
(Funcionalidad 005: Evaluación del expediente, esquela de pago y pago en caja. Como evaluador quiero
revisar el expediente, confirmar o corregir el nivel de riesgo y luego aprobarlo, observarlo o
denegarlo, para que el trámite avance según el TUPA. Como administrado quiero obtener una esquela de
pago con el monto y el código de mi expediente, para pagar en la caja de la Municipalidad. Como
personal de caja quiero registrar el pago con el código de la esquela, viendo antes el expediente, el
titular y el monto, para no registrar la esquela equivocada. Como jefatura quiero corregir un número
de recibo mal digitado indicando el motivo y ver quién registró cada pago o decisión.)

**Cubre**: HU07, HU04, HU13 y HU17; RF09, RF11, RF12, RF24 y RF25 (para pagos y decisiones del
evaluador); casos de uso CU13, CU14, CU16 y CU21; ADR-004 (una esquela por expediente), ADR-005
(eventos en una cola de la base de datos) y ADR-007 (seguridad por capas). Issues de GitHub: #7
(HU04), #16 (HU13), #20 (HU17) y la HU07 del milestone 006. Une la 005 (esquela y pago) y la 006
(evaluación) del plan original. Usa los expedientes de la 004, el catálogo de la 003 y la seguridad de
la 002.

## Aclaraciones

### Sesión 2026-11-20

Por indicación de la usuaria, cada pregunta se respondió con la opción recomendada.

- P: ¿Qué pasa al confirmar el riesgo de una licencia sin tasa (bodega, 0.00)? → R: No se genera
  esquela; el expediente pasa directamente a PAGADO con el comentario "Sin pago: tasa 0.00" en el
  historial, y se aprueba igual que la ruta A (aprobar se permite en las rutas A y C).
- P: ¿Los documentos de la subsanación se asocian a un requisito? → R: Sí, cada documento se asocia a
  un requisito de la receta que el expediente guardó al presentar, igual que en la 004.
- P: ¿Qué evaluador puede decidir sobre un expediente? → R: Cualquier usuario con rol EVALUADOR;
  queda registrado quién empezó la revisión. La asignación a una persona es de la funcionalidad 006.
- P: ¿Qué formato tiene el número de recibo? → R: De 4 a 30 caracteres (letras mayúsculas, números y
  guiones), como ya declara el contrato del proyecto; se normaliza a mayúsculas y sin espacios antes
  de validarlo. (La respuesta recomendada decía "de 1 a 30"; se ajustó al contrato durante el plan.)
- P (plan): ¿La esquela se genera en la misma operación que confirma el riesgo? → R: No en la misma
  transacción: el módulo de trámites cambia el estado y deja la solicitud de esquela en la cola de
  eventos en una sola operación, y el módulo de pagos genera la esquela en pocos segundos. Así cada
  módulo escribe solo sus propios datos (constitución, principios I y III). Mientras tanto, la
  descarga del PDF responde que todavía se está generando.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Evaluar el expediente y confirmar el riesgo (Prioridad: P1)

El evaluador abre un expediente recién presentado desde la bandeja, empieza la revisión y confirma el
nivel de riesgo de la licencia que eligió el administrado o lo corrige a otra licencia del mismo
grupo. Al confirmar, el sistema genera la esquela de pago con el monto de la licencia y el
expediente queda esperando el pago. Si falta algo, el evaluador observa el expediente (una sola vez);
si no procede, lo deniega con un motivo.

**Por qué esta prioridad**: sin evaluación no hay esquela ni pago; es el paso que hace avanzar el
trámite según el TUPA (HU07, RF09) y produce la esquela (HU04, RF11).

**Prueba independiente**: con un expediente REGISTRADO de la 004, entrar como evaluador, empezar la
revisión, confirmar el riesgo y comprobar que existe una sola esquela con el código y el monto de la
licencia y que el expediente está esperando el pago.

**Escenarios de aceptación**:

1. **Dado** un expediente REGISTRADO, **Cuando** el evaluador empieza la revisión, **Entonces** el
   expediente pasa a EN_EVALUACION y queda en el historial con el evaluador.
2. **Dado** un expediente EN_EVALUACION de riesgo medio, **Cuando** el evaluador confirma el riesgo,
   **Entonces** en pocos segundos queda generada una esquela con el código `ESQ-<número de expediente>`, el concepto, el monto
   de la licencia y la fecha, y el expediente pasa a PENDIENTE_PAGO.
3. **Dado** el mismo expediente, **Cuando** el evaluador corrige el riesgo a "riesgo alto",
   **Entonces** el expediente toma la licencia, la ruta y la tasa vigentes de riesgo alto, y la esquela
   se genera con ese monto.
4. **Dado** un expediente que ya tiene esquela, **Cuando** se vuelve a confirmar el riesgo (doble
   clic, reintento o dos evaluadores a la vez), **Entonces** no se crea una segunda esquela y se
   responde con un mensaje claro.
5. **Dado** un expediente EN_EVALUACION, **Cuando** el evaluador lo observa con el texto de lo que
   falta, **Entonces** pasa a OBSERVADO y el texto queda guardado.
6. **Dado** un expediente que ya fue observado una vez, **Cuando** el evaluador intenta observarlo de
   nuevo, **Entonces** se rechaza (el TUPA permite una sola observación).
7. **Dado** un expediente EN_EVALUACION, **Cuando** el evaluador lo deniega con un motivo,
   **Entonces** pasa a DENEGADO y ninguna acción posterior lo hace avanzar.
8. **Dado** un expediente REGISTRADO, **Cuando** se intenta confirmar el riesgo, aprobar o denegar
   sin haber empezado la revisión, **Entonces** se responde que la acción no corresponde al estado
   actual del expediente.

---

### Historia de usuario 2 - Registrar el pago en caja (Prioridad: P1)

El personal de caja busca la esquela por su código, ve el expediente, el nombre del titular, la
licencia y el monto, confirma y registra el número de recibo. El expediente queda pagado sin que el
cajero tenga que hacer nada más.

**Por qué esta prioridad**: el pago es el centro del ingreso municipal y la base del resto del
trámite (HU13, RF12); un pago duplicado o mal asignado es un problema contable.

**Prueba independiente**: con una esquela pendiente, entrar como cajero, buscarla por su código,
comprobar los datos que se muestran antes de confirmar, registrar el recibo y ver que la esquela
figura pagada y el expediente pasa a PAGADO.

**Escenarios de aceptación**:

1. **Dado** una esquela pendiente, **Cuando** el cajero busca su código, **Entonces** ve el número de
   expediente, el nombre del titular, la licencia y el monto antes de confirmar.
2. **Dado** que el cajero confirma con un número de recibo, **Cuando** se registra el pago,
   **Entonces** quedan guardados el recibo, la fecha y hora y el cajero, y queda en la auditoría.
3. **Dado** un pago registrado, **Cuando** pasan unos segundos, **Entonces** el expediente pasa a
   PAGADO sin otra acción del cajero, y queda en el historial.
4. **Dado** una esquela ya pagada, **Cuando** alguien intenta pagarla otra vez (o diez cajeros a la
   vez), **Entonces** solo un pago queda registrado y los demás reciben "esta esquela ya fue pagada".
5. **Dado** un número de recibo ya usado en otra esquela, **Cuando** el cajero lo ingresa,
   **Entonces** se rechaza con un mensaje claro.
6. **Dado** una esquela de un expediente DENEGADO, **Cuando** el cajero intenta pagarla,
   **Entonces** se rechaza con un mensaje claro.
7. **Dado** un código que no existe, **Cuando** el cajero lo busca, **Entonces** se le informa que no
   hay una esquela con ese código.

---

### Historia de usuario 3 - Obtener la esquela de pago (Prioridad: P2)

El administrado consulta su trámite (funcionalidad 004) y, si está esperando el pago, ve el monto y
descarga la esquela en PDF para llevarla a la caja. El personal también la descarga desde el detalle
del expediente.

**Por qué esta prioridad**: el administrado necesita saber cuánto y dónde pagar (HU04, RF11); el
cajero puede trabajar solo con el código, así que el PDF facilita pero no bloquea el pago.

**Prueba independiente**: con un expediente PENDIENTE_PAGO, consultarlo con el número y el documento
del titular, ver el enlace de la esquela y descargarla; el PDF muestra el número, el concepto, el
monto, el código y cómo pagar, sin el documento ni la dirección del titular.

**Escenarios de aceptación**:

1. **Dado** un expediente PENDIENTE_PAGO, **Cuando** el administrado lo consulta, **Entonces** ve el
   código y el monto de la esquela y un enlace "Descargar esquela".
2. **Dado** ese enlace, **Cuando** lo usa, **Entonces** descarga un PDF con el número de expediente,
   el concepto, el monto, el código y las instrucciones para pagar en caja.
3. **Dado** el PDF, **Cuando** se revisa su contenido, **Entonces** no aparece el documento ni la
   dirección del titular.
4. **Dado** un expediente que no está esperando el pago, **Cuando** el administrado lo consulta,
   **Entonces** no ve el enlace de la esquela.
5. **Dado** un evaluador, cajero o jefatura, **Cuando** abre el detalle de un expediente con esquela,
   **Entonces** puede descargarla.

---

### Historia de usuario 4 - Subsanar la observación (Prioridad: P2)

Cuando el expediente está observado, el administrado (con su identidad confirmada) o mesa de partes
sube los documentos que faltaban y el expediente vuelve a evaluación.

**Por qué esta prioridad**: sin subsanación un expediente observado no puede seguir (CU05, HU07); es
menos frecuente que el flujo principal.

**Prueba independiente**: con un expediente OBSERVADO, confirmar la identidad del titular, subir un
documento y subsanar; el expediente vuelve a EN_EVALUACION con el documento agregado.

**Escenarios de aceptación**:

1. **Dado** un expediente OBSERVADO, **Cuando** el administrado lo consulta, **Entonces** ve el texto
   de la observación.
2. **Dado** un expediente OBSERVADO, **Cuando** el titular confirma su identidad y sube los documentos
   que faltaban, **Entonces** el expediente vuelve a EN_EVALUACION y los documentos quedan agregados.
3. **Dado** una persona que confirmó una identidad distinta de la del titular, **Cuando** intenta
   subsanar, **Entonces** se rechaza.
4. **Dado** mesa de partes, **Cuando** subsana en nombre del titular, **Entonces** el expediente
   vuelve a EN_EVALUACION y queda quién lo hizo.
5. **Dado** un expediente que no está OBSERVADO, **Cuando** se intenta subsanar, **Entonces** se
   responde que la acción no corresponde al estado.

---

### Historia de usuario 5 - Aprobar el expediente pagado (Prioridad: P3)

Cuando el pago de un expediente de ruta A (o de bodega, ruta C, que no paga) está registrado, el
evaluador lo aprueba. La emisión de la
licencia y la ruta B con inspección previa son de la funcionalidad siguiente.

**Por qué esta prioridad**: cierra la evaluación de la ruta A; la licencia que se entrega al
administrado llega en la siguiente funcionalidad.

**Prueba independiente**: con un expediente de ruta A PAGADO, entrar como evaluador y aprobarlo; el
expediente queda APROBADO.

**Escenarios de aceptación**:

1. **Dado** un expediente de ruta A PAGADO, **Cuando** el evaluador lo aprueba, **Entonces** queda
   APROBADO y en el historial.
2. **Dado** un expediente que no está PAGADO, o uno de ruta B, **Cuando** se intenta aprobar,
   **Entonces** se responde que la acción no corresponde.
3. **Dado** un expediente de bodega (tasa 0.00), **Cuando** el evaluador confirma el riesgo,
   **Entonces** pasa directamente a PAGADO sin esquela y luego se puede aprobar.

---

### Historia de usuario 6 - Corregir un recibo y revisar la auditoría (Prioridad: P3)

Jefatura corrige un número de recibo mal digitado indicando el motivo, y revisa quién registró cada
pago y cada decisión del evaluador.

**Por qué esta prioridad**: control interno (HU17, RF24, RF25); es poco frecuente pero obligatorio.

**Prueba independiente**: con un pago registrado, entrar como jefatura, corregir el recibo con un
motivo y ver en la auditoría el recibo anterior, el nuevo, quién y cuándo.

**Escenarios de aceptación**:

1. **Dado** una esquela pagada, **Cuando** jefatura corrige el recibo con un motivo, **Entonces** el
   recibo cambia y la auditoría guarda el anterior, el nuevo, el motivo, el usuario y la fecha.
2. **Dado** una corrección sin motivo, **Cuando** se envía, **Entonces** se rechaza.
3. **Dado** una esquela no pagada, **Cuando** se intenta corregir su recibo, **Entonces** se rechaza.
4. **Dado** jefatura, **Cuando** consulta la auditoría de pagos de un rango de fechas, **Entonces** ve
   usuario, acción, fecha y hora de cada registro y corrección, sin datos personales del titular.
5. **Dado** jefatura, **Cuando** consulta la auditoría de un expediente, **Entonces** ve las decisiones
   del evaluador con su usuario y fecha.

---

### Casos límite

- **Doble confirmación del riesgo**: dos evaluadores o un doble clic confirman a la vez; solo se crea
  una esquela y el expediente pasa una sola vez a PENDIENTE_PAGO.
- **Corrección a una licencia desactivada**: si la licencia de destino no está vigente en el
  catálogo, se rechaza la corrección.
- **Corrección fuera del grupo**: no se puede corregir una licencia de establecimiento a una de
  cesionario, corporativa o bodega (ni al revés).
- **Licencia sin tasa** (bodega, tasa 0.00): al confirmar el riesgo no se genera esquela y el
  expediente pasa directamente a PAGADO con el comentario "Sin pago: tasa 0.00".
- **Diez pagos simultáneos** de la misma esquela: uno solo queda registrado.
- **El paso a PAGADO falla** (por ejemplo, la base no responde un momento): se reintenta hasta lograrlo
  y el pago nunca se pierde ni se aplica dos veces.
- **Recibo con espacios o minúsculas**: se normaliza antes de compararlo.
- **Expediente DENEGADO**: ninguna acción (riesgo, pago, aprobación, subsanación) lo hace avanzar.
- **Segunda observación**: se rechaza.
- **Subsanar sin documentos**: se rechaza; hace falta al menos uno.
- **Cambios de tasa en el catálogo** después de generar la esquela: el monto de la esquela no cambia.
- **Datos personales**: ni la esquela en PDF, ni la auditoría, ni los registros de la aplicación
  muestran el documento, el RUC, el celular, el correo ni la dirección del titular.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Evaluación (CU13, RF09)**

- **FR-001**: Solo un usuario con rol EVALUADOR puede empezar la revisión, confirmar o corregir el
  riesgo, observar, denegar y aprobar. Cualquier evaluador puede decidir sobre cualquier expediente.
- **FR-002**: Empezar la revisión pasa el expediente de REGISTRADO a EN_EVALUACION y registra quién
  la empezó.
- **FR-003**: Confirmar el riesgo solo se permite con el expediente EN_EVALUACION. El evaluador puede
  dejar la licencia presentada o elegir otra licencia vigente del **mismo grupo**: establecimientos
  (riesgo bajo, medio, alto y muy alto), cesionarios (riesgo medio, alto y muy alto); la licencia
  corporativa y la de bodegas no tienen alternativas.
- **FR-004**: Si el riesgo se corrige, el expediente toma la licencia, la ruta y la tasa vigentes de la
  nueva licencia, y queda registrado el riesgo propuesto (el presentado) y el confirmado.
- **FR-005**: Confirmar el riesgo pasa el expediente a PENDIENTE_PAGO y solicita su esquela en una
  sola operación (o ambas cosas ocurren, o ninguna); la esquela queda disponible en 30 segundos o
  menos y, si su generación falla, se reintenta sin crear otra. Si la tasa de la licencia confirmada es 0.00,
  no se genera esquela y el expediente pasa directamente a PAGADO con el comentario "Sin pago: tasa
  0.00".
- **FR-006**: Un expediente tiene como máximo una esquela; una segunda confirmación no crea otra y
  responde que el expediente ya tiene esquela.
- **FR-007**: Observar solo se permite con el expediente EN_EVALUACION, exige un texto de 10 a 1,000
  caracteres y pasa el expediente a OBSERVADO. Un expediente se puede observar una sola vez.
- **FR-008**: Denegar solo se permite con el expediente EN_EVALUACION, exige un motivo de 10 a 1,000
  caracteres y pasa el expediente a DENEGADO. Un expediente DENEGADO no admite más cambios de estado.
- **FR-009**: Aprobar solo se permite con el expediente PAGADO y de ruta A o C, y lo deja APROBADO.
- **FR-010**: Toda acción que no corresponde al estado del expediente se rechaza con un mensaje claro
  que nombra el estado actual.

**Subsanación (CU05)**

- **FR-011**: Un expediente OBSERVADO se subsana agregando al menos un documento, cada uno asociado a
  un requisito de la receta que el expediente guardó al presentar. Puede hacerlo el titular con su
  identidad confirmada (el mismo mecanismo de la 004) o mesa de partes con su sesión.
- **FR-012**: En línea, la identidad confirmada debe ser la del titular del expediente; si no, se
  rechaza sin revelar de quién es el expediente.
- **FR-013**: Subsanar agrega los documentos al expediente y lo devuelve a EN_EVALUACION.

**Esquela (CU14, RF11)**

- **FR-014**: La esquela tiene el código `ESQ-<número de expediente>`, el concepto (el nombre de la
  licencia), el monto copiado de la tasa vigente de la licencia confirmada y la fecha de emisión.
- **FR-015**: El monto de la esquela no cambia aunque luego cambie la tasa en el catálogo.
- **FR-016**: El administrado ve el código, el monto y el enlace para descargar la esquela al
  consultar su expediente cuando está PENDIENTE_PAGO, sin iniciar sesión.
- **FR-017**: El personal con rol EVALUADOR, CAJA o JEFATURA descarga la esquela desde el detalle del
  expediente.
- **FR-018**: La esquela en PDF muestra el número de expediente, el concepto, el monto, el código, la
  fecha y cómo pagar en la caja de la Municipalidad; no muestra el documento ni la dirección del
  titular.

**Pago en caja (CU16, RF12)**

- **FR-019**: Solo un usuario con rol CAJA busca esquelas por código y registra pagos.
- **FR-020**: Antes de confirmar, el cajero ve el número de expediente, el nombre del titular, la
  licencia, el monto y si la esquela ya está pagada.
- **FR-021**: Registrar el pago guarda el número de recibo, la fecha y hora y el cajero, y deja la
  auditoría `REGISTRAR_PAGO`, todo en una sola operación.
- **FR-022**: Una esquela se paga una sola vez, aun con pagos simultáneos; los intentos siguientes
  responden "esta esquela ya fue pagada".
- **FR-023**: El número de recibo tiene de 4 a 30 caracteres (letras, números y guiones), se guarda en
  mayúsculas y sin espacios, y no se puede repetir entre esquelas.
- **FR-024**: No se registra el pago de una esquela cuyo expediente no está PENDIENTE_PAGO (por
  ejemplo, DENEGADO).
- **FR-025**: Al registrarse el pago, el expediente pasa a PAGADO automáticamente en pocos segundos;
  si ese paso falla, se reintenta hasta lograrlo, sin perder el pago ni aplicarlo dos veces.

**Corrección y auditoría (CU21, RF24, RF25)**

- **FR-026**: Solo jefatura corrige el número de recibo de una esquela pagada, con un motivo de 10 a
  500 caracteres; queda en la auditoría `CORREGIR_RECIBO` con el recibo anterior y el nuevo. Los
  pagos no se anulan.
- **FR-027**: Solo jefatura consulta la auditoría de pagos (filtrable por rango de fechas, del más
  reciente al más antiguo, paginada) y la de las decisiones de un expediente.
- **FR-028**: Cada registro de auditoría muestra el usuario, la acción y la fecha y hora; nunca datos
  personales del titular.
- **FR-029**: Cada decisión del evaluador (empezar revisión, confirmar riesgo, observar, denegar,
  aprobar) y cada subsanación deja su registro de auditoría con el usuario.

**Estados e historial**

- **FR-030**: Cada cambio de estado del expediente queda en su historial (estado anterior, nuevo,
  usuario y comentario) y genera un evento para las notificaciones de la funcionalidad siguiente.

**Permisos**

- **FR-031**: Las operaciones nuevas responden 401 sin sesión y 403 a los roles que no les
  corresponden; un rechazo nunca cambia datos.

**Portal**

- **FR-032**: El detalle del expediente del personal muestra solo los botones que corresponden al rol
  y al estado (empezar revisión, confirmar riesgo, observar, denegar, aprobar, descargar esquela).
- **FR-033**: Caja tiene una pantalla para buscar la esquela, ver sus datos, confirmar y registrar el
  recibo.
- **FR-034**: Jefatura tiene una pantalla con la auditoría de pagos y la corrección de recibos.
- **FR-035**: La consulta pública muestra el monto y "Descargar esquela" cuando el expediente está
  PENDIENTE_PAGO, y el texto de la observación cuando está OBSERVADO.

**Calidad**

- **FR-036**: Los textos de error del evaluador, la caja y jefatura están en lenguaje sencillo y no
  repiten datos personales.

### Entidades clave

- **Esquela**: código `ESQ-<número>`, expediente, concepto, monto, fecha de emisión, estado (pendiente
  o pagada), número de recibo, fecha y hora del pago y cajero. Una por expediente.
- **Expediente** (de la 004): agrega el riesgo propuesto y el confirmado, la observación (texto,
  fecha, evaluador) y el motivo de denegación; sus estados avanzan según las reglas de esta
  funcionalidad.
- **Registro de auditoría de pagos**: usuario, acción (`REGISTRAR_PAGO`, `CORREGIR_RECIBO`), esquela,
  recibo anterior y nuevo, motivo, fecha y hora.
- **Registro de auditoría de trámites** (de la 004): agrega las acciones del evaluador y la
  subsanación.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Un evaluador confirma el riesgo de un expediente desde la bandeja en 2 minutos o menos.
- **SC-002**: Un cajero registra un pago desde que recibe el código de la esquela en 1 minuto o
  menos.
- **SC-003**: Ninguna esquela queda pagada dos veces ni ningún expediente tiene dos esquelas, aun con
  10 operaciones simultáneas sobre el mismo expediente o la misma esquela.
- **SC-004**: El 100 % de los pagos registrados deja el expediente en PAGADO en 30 segundos o menos
  en condiciones normales, y ningún pago se pierde si ese paso falla y se reintenta.
- **SC-005**: El 100 % de los pagos y decisiones del evaluador tiene su registro de auditoría con el
  usuario y la fecha.
- **SC-006**: Ningún registro de la aplicación, fila de auditoría ni esquela en PDF contiene el
  documento, el RUC, el celular, el correo ni la dirección del titular.
- **SC-007**: El 100 % de los intentos sin sesión o con un rol que no corresponde se rechaza sin
  cambiar datos.

## Supuestos

- Los expedientes llegan REGISTRADO desde la 004; la bandeja y el detalle del personal ya existen.
- Los grupos de licencias se toman del catálogo de la 003 (establecimiento, cesionario, corporativa,
  bodega); "corregir el riesgo" solo cambia entre licencias del mismo grupo.
- No se calculan plazos en días hábiles ni se vence la subsanación (funcionalidad 006); tampoco se
  envían notificaciones (006), aunque cada cambio deja su evento.
- La ruta B (inspección previa) y la emisión de la licencia con QR quedan para la 006: un expediente de
  ruta B pagado queda PAGADO a la espera de esa funcionalidad.
- El pago es presencial en efectivo o con el medio que acepte la caja; el sistema solo registra el
  número de recibo. No hay pagos digitales ni anulación de pagos.
- No se mide carga, Lighthouse ni ZAP en esta funcionalidad; se hacen una sola vez en el despliegue
  (007). La cobertura mínima y las verificaciones automáticas siguen siendo obligatorias.

## Fuera de alcance

Emisión de la licencia con QR, ruta B e inspección ITSE (006); notificaciones por correo o SMS (006);
vencimiento de plazos en días hábiles (006); anulación de pagos; pagos digitales.
