# Especificación de funcionalidad: Monitoreo de los códigos enviados

**Rama de la funcionalidad**: `010-codigo-enviado`

**Creada**: 2026-11-24

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/010-codigo-enviado.md"
(Funcionalidad 010. El administrador del sistema debe saber cuándo alguien pide un código de 6
dígitos, para entrar como personal o para confirmar la identidad de un administrado, a qué destino
se envió y si después entró o falló, para detectar una actividad sospechosa.)

**Decisión tomada con la usuaria**: el administrador **nunca** ve el código. Es la segunda llave de
la persona: si lo viera, podría entrar haciéndose pasar por ella y la auditoría se lo atribuiría.

**Amplía**: la 009 (auditoría de seguridad y panel) y la 002 y la 004 (envío del código).

## Aclaraciones

### Sesión 2026-11-24

Por indicación de la usuaria, cada pregunta se respondió con la opción recomendada.

- P: Al alcanzar el límite de 3 códigos en 15 minutos, ¿se reutiliza una acción existente (por
  ejemplo, "Cuenta bloqueada") o se crea una nueva? → R: Una acción nueva, **"Límite de códigos
  alcanzado"** (`CODIGO_LIMITE_ALCANZADO`, grupo Ingresos). "Cuenta bloqueada" significa demasiados
  intentos fallidos y suma a los ingresos fallidos del panel; mezclarlos confundiría las cifras.
- P: ¿Cuentan los envíos fallidos en la tarjeta "Códigos enviados" del panel? → R: No. La tarjeta
  cuenta los entregados (hoy y 7 días), cuántos de esos terminaron en ingreso correcto y, aparte,
  cuántos envíos fallaron hoy.
- P: ¿El CSV de la auditoría incluye el resultado del intento de cada "Código enviado"? → R: Sí. Se
  agrega una columna final `desenlace`, vacía para las demás acciones; las 6 columnas de la 009
  quedan iguales y en el mismo orden.
- P: ¿Con qué formato se enmascara el destino? → R: El mismo de todo el sistema: celular
  `9*****321` (primer dígito y los 3 últimos) y correo `ju***@correo.pe`. Así coincide con el asunto
  del buzón y con la pantalla de ingreso.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Ver en la auditoría cada código enviado (Prioridad: P1)

Cada vez que el sistema envía un código de 6 dígitos, la auditoría de seguridad muestra un evento
"Código enviado" con para qué era (ingreso del personal o identidad del administrado), por qué medio
se envió, el destino enmascarado y si el envío se entregó o falló. En un ingreso del personal, el
evento se asocia a la cuenta; en la identidad del administrado, a "identidad del administrado", sin
documento ni RUC.

**Por qué esta prioridad**: es el pedido central: notar a tiempo que alguien pide códigos de una
cuenta que no es suya.

**Prueba independiente**: pedir un código de ingreso y uno de identidad, y encontrar los dos eventos
en la auditoría, con el destino enmascarado y sin el código.

**Escenarios de aceptación**:

1. **Dado** un usuario del personal que escribe bien su correo y su clave, **cuando** el sistema le
   envía el código, **entonces** la auditoría registra "Código enviado" sobre su cuenta, sin actor
   ("Sin sesión"), con el propósito "ingreso del personal", el medio, el celular enmascarado y
   "entregado".
2. **Dado** un administrado que verifica su identidad, **cuando** el sistema le envía el código,
   **entonces** la auditoría registra "Código enviado" sin cuenta, con el objeto "identidad del
   administrado", el celular enmascarado y sin documento ni RUC.
3. **Dado** que el medio de envío no responde, **cuando** se intenta enviar el código, **entonces** la
   auditoría registra "Código enviado" con resultado "falló" y la persona recibe el mismo mensaje de
   siempre.
4. **Dado** cualquier código enviado, **cuando** se revisan la auditoría, el CSV, el panel, la ficha
   y los registros de la aplicación, **entonces** el código de 6 dígitos no aparece en ninguno.

---

### Historia de usuario 2 - Saber cómo terminó cada código del personal (Prioridad: P1)

Junto a cada "Código enviado" de un ingreso del personal, la auditoría muestra cómo terminó ese mismo
intento: ingreso correcto, código incorrecto, bloqueo o sin usar (si venció).

**Por qué esta prioridad**: un código enviado que nunca se usa, o que termina en códigos incorrectos,
es la señal de alerta; sin el resultado, el evento solo dice que alguien pidió un código.

**Prueba independiente**: pedir un código y entrar; pedir otro y equivocarse; pedir un tercero y no
usarlo; ver el resultado de cada uno en la auditoría.

**Escenarios de aceptación**:

1. **Dado** un código enviado que se usó bien, **cuando** el administrador ve la auditoría,
   **entonces** ese "Código enviado" dice "terminó en ingreso correcto".
2. **Dado** un código con el que se falló, **cuando** se ve la auditoría, **entonces** dice "terminó
   en código incorrecto" (o en bloqueo, si se bloqueó).
3. **Dado** un código que venció sin usarse, **cuando** se ve la auditoría, **entonces** dice "sin
   usar".
4. **Dado** un código todavía vigente y sin usar, **cuando** se ve la auditoría, **entonces** dice
   "pendiente".

---

### Historia de usuario 3 - Tarjeta "Códigos enviados" en el panel (Prioridad: P2)

El panel del administrador muestra cuántos códigos se enviaron hoy y en los últimos 7 días, y cuántos
terminaron en un ingreso correcto, con un acceso a la auditoría filtrada por "Código enviado".

**Por qué esta prioridad**: da el vistazo rápido, pero la auditoría ya tiene el detalle.

**Prueba independiente**: con códigos enviados sembrados, abrir el panel y comprobar las cifras.

**Escenarios de aceptación**:

1. **Dado** 3 códigos enviados hoy, 1 de ellos usado para entrar, **cuando** el administrador abre el
   panel, **entonces** la tarjeta dice 3 hoy y 1 con ingreso correcto.
2. **Dado** la tarjeta, **cuando** el administrador sigue su enlace, **entonces** abre la auditoría
   filtrada por "Código enviado".
3. **Dado** la ficha de un usuario, **cuando** se muestran sus últimos eventos, **entonces** incluyen
   sus "Código enviado".

---

### Historia de usuario 4 - Ver el pedido insistente de códigos (Prioridad: P2)

Cuando alguien alcanza el límite de 3 códigos en 15 minutos, la auditoría lo registra, para que el
administrador vea un pedido insistente.

**Por qué esta prioridad**: complementa la HU1 en el caso de abuso; la regla del límite no cambia.

**Prueba independiente**: pedir 4 códigos seguidos de la misma cuenta y ver el evento del límite.

**Escenarios de aceptación**:

1. **Dado** un usuario que ya recibió 3 códigos en 15 minutos, **cuando** pide el cuarto, **entonces**
   no se envía (como hoy) y la auditoría registra el límite alcanzado sobre su cuenta.
2. **Dado** un celular de administrado que ya recibió 3 códigos, **cuando** se pide el cuarto,
   **entonces** la auditoría registra el límite alcanzado sin documento, RUC ni celular completo.

---

### Casos límite

- **Correo inexistente o clave incorrecta**: no se envía código; no hay "Código enviado" (ya se
  registra el intento fallido de la 009).
- **Pedir otro código**: cada envío es un evento propio; el anterior queda "sin usar" o vencido.
- **El canal falla**: "Código enviado" con resultado "falló"; no cuenta como código enviado con
  éxito en el panel.
- **Auditoría caída al enviar**: el envío sigue y la persona puede entrar; se avisa en los registros
  sin datos (igual que los intentos fallidos de la 009).
- **Código de identidad del administrado**: no hay cuenta ni ingreso posterior que vincular; su
  resultado posterior no se muestra.
- **Destino corto o raro**: el enmascarado nunca muestra más que el primer dígito y los 3 últimos.
- **Envío fallido en el panel**: cuenta en "fallaron hoy", no en los entregados.

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: El sistema MUST registrar la acción "Código enviado" (grupo Ingresos) cada vez que
  intenta enviar un código de 6 dígitos, para el ingreso del personal y para la identidad del
  administrado.
- **FR-002**: En el ingreso del personal, el afectado MUST ser la cuenta y quien actuó MUST quedar
  vacío. En la identidad del administrado, MUST no haber cuenta y el objeto MUST ser "identidad del
  administrado".
- **FR-003**: El detalle MUST tener solo: propósito (ingreso del personal o identidad del
  administrado), medio (buzón, simulado, correo o SMS), destino enmascarado y si se entregó o falló.
- **FR-004**: Si el envío falla, el evento MUST registrarse con resultado "falló" y la respuesta a la
  persona MUST ser la misma de siempre.
- **FR-005**: El código de 6 dígitos MUST NOT guardarse ni mostrarse en la auditoría, el CSV, el
  panel, la ficha, los registros de la aplicación ni en ningún lugar visible para el administrador.
- **FR-006**: Cada "Código enviado" de un ingreso del personal MUST mostrar el resultado de ese mismo
  intento: ingreso correcto, código incorrecto, bloqueo, sin usar (vencido) o pendiente (vigente).
- **FR-007**: El vínculo entre el envío y su resultado MUST hacerse con un identificador del intento
  que no sea un dato personal.
- **FR-008**: El panel MUST mostrar los códigos entregados hoy y en los últimos 7 días, cuántos de
  ellos terminaron en ingreso correcto y cuántos envíos fallaron hoy, con un enlace a la auditoría
  filtrada por "Código enviado".
- **FR-009**: Los últimos eventos de la ficha del usuario MUST incluir sus "Código enviado".
- **FR-010**: Al alcanzar el límite de 3 códigos en 15 minutos, la auditoría MUST registrar la acción
  nueva "Límite de códigos alcanzado" (la regla no cambia). Esta acción no suma a los ingresos
  fallidos del panel.
- **FR-012**: El CSV de la auditoría MUST agregar al final la columna `desenlace` (el resultado del
  intento de cada "Código enviado" del personal; vacía en lo demás), sin cambiar las 6 columnas de la
  009.
- **FR-013**: El destino MUST enmascararse como en el resto del sistema: celular `9*****321` y correo
  `ju***@correo.pe`.
- **FR-011**: Los permisos MUST seguir iguales: solo ADMINISTRADOR ve la auditoría y el panel (401
  sin sesión, 403 con otro rol).

### Entidades clave

- **Código enviado** (evento de auditoría): propósito, medio, destino enmascarado, entregado o
  fallido, identificador del intento (solo en el ingreso del personal), cuenta afectada o "identidad
  del administrado". Nunca el código.
- **Resultado del intento**: se deduce de los eventos posteriores con el mismo identificador o del
  vencimiento del código.
- **Límite de códigos alcanzado** (evento de auditoría): sobre la cuenta o la identidad del
  administrado.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El 100 % de los códigos enviados (con éxito o con falla) aparece en la auditoría,
  verificado por pruebas automáticas de los dos propósitos.
- **SC-002**: 0 apariciones del código de 6 dígitos en la auditoría, el CSV, el panel, la ficha y los
  registros de la aplicación, verificado por una prueba de privacidad.
- **SC-003**: El 100 % de los "Código enviado" del personal muestra un resultado entre los 5 posibles.
- **SC-004**: El panel sigue respondiendo en menos de 2 segundos con 10,000 eventos.
- **SC-005**: La matriz de permisos de la 009 sigue en 401/403 sin cambios.

## Supuestos

- "Hoy" y "7 días" usan la hora de Lima, como en la 009.
- Un código vence a los 5 minutos (002 y 004).
- El destino del personal es su celular; el del administrado, el celular que escribió.
- Fuera de alcance: el canal real para el servidor (Sprint 3, como un adaptador más del mismo
  puerto), mostrar el código al administrador y alertas automáticas.
- Restricción del entorno de la usuaria: poca memoria. Lo pesado lo valida la integración continua.
