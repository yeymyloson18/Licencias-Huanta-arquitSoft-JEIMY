Funcionalidad 009: Panel del administrador, auditoría de seguridad y buzón de pruebas.

Pedido de la usuaria después de cerrar el Sprint 2: el administrador del sistema entra con sus credenciales y debe tener SU interfaz para administrar todo el sistema, verificar y monitorear a los demás usuarios y roles, con su botón de auditoría; y si hay una actividad sospechosa, poder detener a un usuario. Además, en la computadora de desarrollo todo debe poder probarse por el link, sin leer códigos desde la terminal.

Amplía la 002 (HU15, RF16, RF17, RF22) y toca ADR-007 (seguridad por capas). Respeta la constitución v1.0.0: monolito modular + Clean Architecture, contrato primero, un esquema por módulo, datos personales nunca en URL, registros ni errores (Ley N.° 29733), toda tarea con prueba, cobertura ≥ 80 %, rama propia y PR con los 5 checks en verde.

Lo que YA existe y no se rehace: crear usuarios con clave temporal y roles, cambio obligatorio de clave en el primer ingreso, editar y desactivar (corta sus sesiones al instante), asignar y quitar roles con historial (seguridad.usuario_rol), clave temporal nueva, regla de "nunca sin administrador", catálogo (/admin/catalogo) y feriados (/admin/feriados). Los 6 roles son fijos (salen del proceso del TUPA y de la matriz de permisos): el administrador asigna roles, no inventa roles nuevos. A un usuario no se le elimina: se le desactiva, para no perder la trazabilidad.

## Qué debe hacer el sistema (especificación)

Como administrador del sistema quiero un panel donde vea de un vistazo el estado de los usuarios y de la seguridad, para detectar a tiempo una actividad sospechosa.

Como administrador quiero una auditoría de seguridad con filtros, para saber quién hizo qué y cuándo.

Como administrador quiero, desde la ficha de un usuario, cerrar todas sus sesiones, desbloquear su cuenta y ver su historial de roles, para actuar rápido ante un problema.

Como estudiante que prueba el sistema en su computadora quiero ver los códigos de 6 dígitos y los avisos en una página web, para probar todo por el link sin usar la terminal.

1. Panel del administrador (/admin, inicio del rol ADMINISTRADOR al ingresar): tarjetas con usuarios activos e inactivos, usuarios por rol, cuentas bloqueadas en este momento (por intentos fallidos), sesiones abiertas, intentos de ingreso fallidos de hoy y de los últimos 7 días, y los últimos 10 eventos de la auditoría de seguridad. Accesos directos a Usuarios, Auditoría, Catálogo y Feriados. Usable a 360 px y accesible.
2. Auditoría de seguridad (/admin/auditoria, botón "Auditoría" en el menú del administrador): una lista paginada, de la más reciente a la más antigua, con fecha y hora, quién (nombre del usuario o "sistema"), acción, sobre quién o qué (nombre del usuario afectado o código de la receta o fecha del feriado) y resultado. Filtros: rango de fechas, acción, usuario que actuó y usuario afectado. Descarga en CSV con los mismos filtros. Acciones registradas:
   - Ingresos: INGRESO_CORRECTO, CLAVE_INCORRECTA, CODIGO_INCORRECTO, CUENTA_BLOQUEADA, ORIGEN_BLOQUEADO, CIERRE_SESION, CLAVE_CAMBIADA.
   - Gestión de usuarios: USUARIO_CREADO, USUARIO_EDITADO, USUARIO_DESACTIVADO, USUARIO_REACTIVADO, ROL_ASIGNADO, ROL_QUITADO, CLAVE_TEMPORAL_ASIGNADA, SESIONES_CERRADAS, CUENTA_DESBLOQUEADA.
   - Configuración: RECETA_ACTUALIZADA, RECETA_DESACTIVADA, RECETA_REACTIVADA, FERIADO_REGISTRADO, FERIADO_ELIMINADO.
   Para un intento con un correo que no existe se registra el evento sin identificar a nadie (ni el correo, que es dato personal).
3. Ficha del usuario (/admin/usuarios/:id): datos (con el celular enmascarado), roles, estado, último ingreso, sesiones abiertas, si está bloqueado y hasta cuándo, historial de roles (qué rol, quién lo asignó o quitó y cuándo, de seguridad.usuario_rol) y sus últimos eventos de auditoría. Botones, cada uno con confirmación y que queda en la auditoría:
   - "Cerrar todas sus sesiones": sus sesiones dejan de servir al instante (mismo mecanismo que al desactivar), sin desactivarlo.
   - "Desbloquear cuenta": borra el bloqueo por intentos fallidos de esa cuenta antes de los 15 minutos.
   - "Desactivar" / "Reactivar" y "Asignar clave temporal" (ya existen; se mueven a esta ficha).
   El administrador no puede cerrar sus propias sesiones desde aquí ni desbloquearse a sí mismo; se mantiene la regla de no quedar sin administrador activo.
4. Privacidad: la auditoría guarda identificadores internos y nombres de quien actúa y de quien es afectado; nunca correo, celular, documento, clave, código ni la IP en claro (si se guarda el origen, solo su huella HMAC para agrupar intentos). Los registros de la aplicación siguen sin datos personales.
5. Retención: la auditoría de seguridad se conserva al menos 1 año; no se puede editar ni borrar desde la aplicación (solo se agregan registros).
6. Permisos: todo lo anterior solo para ADMINISTRADOR; los demás roles reciben 403 y sin sesión 401. La auditoría de pagos y decisiones de la jefatura (/personal/auditoria, 005) sigue igual (separación de funciones: el administrador cuida accesos y configuración; la jefatura supervisa el trámite).
7. Buzón de pruebas (solo desarrollo): un contenedor Mailpit en el docker compose de desarrollo (interfaz web en http://localhost:8025). Un adaptador nuevo de los puertos EnviadorOTP y EnviadorMensajes (avisos de la 006) entrega ahí cada código de 6 dígitos y cada aviso como un mensaje: el asunto dice a quién iba (celular o correo enmascarado) y para qué; el cuerpo trae el código o el aviso. Nueva opción de configuración (por ejemplo ENVIO_OTP=buzon y ENVIO_AVISOS=buzon) que, igual que el simulado, está PROHIBIDA en producción (la regla de seguridad de la 002 no se debilita). El compose de desarrollo usa el buzón por defecto. Las pruebas de integración y los recorridos E2E siguen funcionando: deben poder seguir leyendo el código (por ejemplo, el adaptador del buzón también deja el código en Redis con la misma clave dev:otp:* y caducidad, o el E2E fija ENVIO_OTP=simulado); no se rompe e2e.yml ni carga-sprint2.yml.
8. Primer administrador por la terminal: se mantiene el paso de instalación de la 002 (crear-administrador), porque una página pública para crear administradores sería un riesgo. Se documenta como el único paso de terminal además de encender el sistema.

Fuera de alcance: roles personalizados, borrar usuarios, correo o SMS reales (Sprint 3), alertas automáticas por correo al administrador.

## Cómo construirlo (guía para el plan)

- Módulo seguridad: tabla nueva seguridad.auditoria (migración 0012; docs/05 en el mismo commit; no editar 0001 a 0011) con id, ocurrido_en, accion (CHECK con la lista), actor_usuario_id (NULL si es el sistema o un intento sin cuenta), afectado_usuario_id, objeto (texto corto: código de receta, fecha de feriado), resultado y detalle jsonb sin datos personales; índices por ocurrido_en, accion y afectado. Los casos de uso de seguridad (ingreso, gestión de usuarios, nuevos cierre de sesiones y desbloqueo) registran en la misma transacción que su cambio.
- Catálogo y feriados no escriben en el esquema de seguridad: publican eventos (RecetaActualizada, FeriadoRegistrado, etc.) en la cola comun.evento_pendiente y seguridad los consume para su auditoría (patrón de la 005), o la vista de auditoría los lee por las fachadas de catalogo y plazos. Elegir en research.md a favor de la constitución (un esquema por módulo, sin importaciones cruzadas).
- Bloqueos: hoy viven en Redis (limitador de la 002). El panel cuenta las cuentas bloqueadas leyendo esas claves por un puerto (sin exponer correos) y "desbloquear" borra las claves de esa cuenta por el mismo puerto. Si Redis no responde, el panel lo dice y el botón queda deshabilitado (no se inventan datos).
- Contrato primero: GET /admin/panel, GET /admin/auditoria (+ CSV), GET /usuarios/{usuarioId} ampliado (último ingreso, sesiones, bloqueo, historial de roles), POST /usuarios/{usuarioId}/cerrar-sesiones, POST /usuarios/{usuarioId}/desbloquear. Matriz de permisos del README del contrato actualizada.
- Dominio puro: catálogo de acciones de auditoría y su texto en español sencillo, reglas de "no a sí mismo" y de "nunca sin administrador", cálculo de las cifras del panel.
- Buzón: dependencia ligera y conocida para SMTP (justificarla en research.md), adaptadores en infraestructura de seguridad y notificaciones, servicio mailpit en infra/docker-compose.yml (no en producción). README: cómo abrir el buzón.
- Portal: /admin (panel), /admin/auditoria, /admin/usuarios/:id (ficha con botones y confirmaciones); el administrador entra directo a /admin al iniciar sesión.
- Pruebas: unitarias del dominio; integración de cada acción registrada (incluido el intento con correo inexistente sin datos personales), cerrar sesiones (la sesión del usuario deja de servir), desbloquear (puede volver a intentar), "no a sí mismo", matriz 401/403 de los endpoints nuevos, privacidad de la auditoría y del CSV, consumo idempotente de los eventos de catálogo y feriados, buzón (el adaptador entrega el mensaje; en producción la configuración lo rechaza); portal con pruebas de las 3 pantallas; E2E y Postman siguen en verde.
- Mi computadora tiene poca memoria: no construir imágenes ni levantar el sistema completo en local; lo pesado lo valida el CI de GitHub.
- Al terminar: README (panel, auditoría, buzón y el recorrido por el link empezando por el administrador), diagrama de casos de uso (agregar los casos del administrador: ver panel, consultar auditoría de seguridad, cerrar sesiones, desbloquear cuenta) y docs/08-sprint-2/README.md con una nota de esta mejora.
