Funcionalidad 010: Monitoreo de los códigos enviados en la auditoría y el panel del administrador.

Pedido de la usuaria después de la 009: el administrador del sistema debe saber cuándo alguien pide un código de 6 dígitos (para entrar como personal o para confirmar la identidad de un administrado), a qué destino se envió y si después entró o falló, para detectar actividad sospechosa. Decisión tomada con la usuaria: el administrador NUNCA ve el código mismo (es la segunda llave del usuario; si lo viera podría entrar haciéndose pasar por otra persona y la auditoría lo atribuiría a ella).

Amplía la 009 (auditoría de seguridad y panel) y la 002/004 (envío del código). Respeta la constitución v1.0.0: Clean Architecture, contrato primero, un esquema por módulo, sin datos personales en URL, registros, errores ni auditoría (Ley N.° 29733), toda tarea con prueba, cobertura ≥ 80 %, rama propia y PR con los checks en verde.

## Qué debe hacer el sistema (especificación)

Como administrador del sistema quiero ver en la auditoría cada vez que se envía un código de verificación, con su destino enmascarado y su resultado, para notar a tiempo si alguien está pidiendo códigos de una cuenta que no es suya.

1. Nueva acción de auditoría CODIGO_ENVIADO (grupo Ingresos), registrada cada vez que el sistema envía un código:
   - Ingreso del personal (002): afectado = la cuenta; quién actuó = vacío ("sin sesión"), igual que los demás eventos previos al ingreso.
   - Identidad del administrado (004): sin cuenta; objeto = "identidad del administrado"; sin documento ni RUC.
   - Detalle (sin datos personales): para qué (INGRESO_PERSONAL o IDENTIDAD_ADMINISTRADO), canal (buzón, simulado, correo o sms), destino enmascarado (por ejemplo ***-***-321 o j***@g***.com) y si el envío se entregó o falló.
   - Si el envío falla (el canal no responde), se registra con resultado "falló" y el usuario recibe el mismo mensaje de siempre.
2. El código de 6 dígitos NUNCA se guarda ni se muestra en la auditoría, en el panel, en el CSV, en los registros de la aplicación ni en ningún otro lugar visible para el administrador.
3. Vínculo con el resultado: en la auditoría, junto a cada CODIGO_ENVIADO de un ingreso del personal se puede ver el resultado posterior de ese mismo intento (INGRESO_CORRECTO, CODIGO_INCORRECTO, bloqueo o "sin usar" si venció). Puede resolverse con un identificador del intento compartido entre los eventos (sin datos personales).
4. Panel del administrador (/admin): nueva tarjeta "Códigos enviados" con los de hoy y los de los últimos 7 días, y cuántos terminaron en ingreso correcto. Accesos a la auditoría filtrada por CODIGO_ENVIADO.
5. Ficha del usuario (/admin/usuarios/:id): sus últimos eventos ya incluyen los CODIGO_ENVIADO de su cuenta.
6. La regla de "3 códigos por usuario o celular cada 15 minutos" no cambia; cuando se alcanza, se registra el evento existente que corresponda (o uno nuevo CODIGO_LIMITE_ALCANZADO si no hay ninguno que lo cubra; decidir en el plan) para que el administrador vea un pedido insistente de códigos.

Fuera de alcance: el canal real para el servidor (decisión de la usuaria para el Sprint 3: correo real gratuito, por ejemplo Brevo; se implementa en el Sprint 3 como un adaptador más del mismo puerto), mostrar el código al administrador, alertas automáticas.

## Cómo construirlo (guía para el plan)

- Módulo seguridad: migración 0013 que amplía la restricción de acciones de seguridad.auditoria (no editar 0001 a 0012; docs/05 en el mismo commit). Catálogo de acciones del dominio y su texto en español sencillo.
- El registro se hace en el caso de uso que pide enviar el código (ingreso del personal e identidad del administrado), por el puerto de auditoría existente, en la misma transacción cuando la haya; el enmascarado del destino es una función pura del dominio con pruebas.
- Contrato primero: ampliar el enum de acciones de auditoría y el esquema del panel en openapi.yaml; Postman actualizado si cambia algo que prueba.
- Portal: texto de la nueva acción en la auditoría y la ficha, tarjeta "Códigos enviados" en el panel.
- Pruebas: unitarias del enmascarado y del catálogo de acciones; integración (ingreso del personal y identidad del administrado registran CODIGO_ENVIADO; envío fallido; el código no aparece en la auditoría, el CSV ni los registros; vínculo con el resultado; panel con las cifras; matriz 401/403 sin cambios); portal.
- Mi computadora tiene poca memoria: no construir imágenes ni levantar el sistema completo en local; lo pesado lo valida el CI.
- Al terminar: README (sección del panel y la auditoría) y docs/08-sprint-2/README.md con una línea de esta mejora.
