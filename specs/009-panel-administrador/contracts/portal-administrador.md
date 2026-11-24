# Contrato del portal: pantallas del administrador (009)

Todas las rutas usan `RutaProtegida roles={['ADMINISTRADOR']}`. Deben leerse a 360 px sin
desplazamiento horizontal, tener un único `<h1>`, etiquetas en cada control y mensajes con
`role="status"` o `role="alert"`.

## Entrada

- Al terminar de ingresar (o de cambiar la clave temporal) sin un destino guardado, una sesión con el
  rol ADMINISTRADOR va a `/admin`; las demás, a `/` como hoy.
- Menú: "Panel" (`/admin`) y "Auditoría" (`/admin/auditoria`) se suman a Usuarios, Catálogo y
  Feriados. La "Auditoría" de JEFATURA (`/personal/auditoria`) no cambia.

## `/admin`: Panel

- `<h1>Panel del administrador</h1>`.
- Tarjetas (`<section aria-labelledby>`): Usuarios (activos e inactivos), Usuarios por rol (lista de
  los 6 roles), Cuentas bloqueadas (y orígenes bloqueados), Sesiones abiertas, Ingresos fallidos (hoy y
  últimos 7 días).
- Si `bloqueos` es `null`: "No disponible: no se pudo consultar el servicio de bloqueos".
- Tabla "Últimos eventos" (fecha, acción, quién, sobre quién o qué, resultado) y enlace "Ver toda la
  auditoría".
- Accesos directos: Usuarios, Auditoría, Catálogo, Feriados.
- Botón "Actualizar" que vuelve a pedir el panel.
- Estados: cargando (`role="status"`), error con "Reintentar".

## `/admin/auditoria`: Auditoría de seguridad

- Filtros en un `<form>`: Desde, Hasta (fecha), Acción (`<select>` agrupado por los 3 grupos),
  Usuario que actuó y Usuario afectado (`<select>` con los usuarios por nombre; envían el id).
  Botones "Filtrar" y "Descargar CSV".
- Tabla con fecha y hora (Lima), acción, quién ("Sin sesión" o "Sistema" si no hay actor), sobre quién
  o qué, resultado. En 360 px la tabla se apila por filas (`data-etiqueta`).
- Paginación "Anterior" / "Siguiente" con "Página X de Y".
- Vacío: "No hay eventos con esos filtros."
- 422: el mensaje del campo junto al filtro.
- CSV truncado: aviso "La descarga tiene las 10,000 filas más recientes; acote las fechas para ver el
  resto".

## `/admin/usuarios/:id`: Ficha del usuario

- `<h1>` con el nombre. Datos: correo, celular enmascarado, roles, estado, último ingreso, sesiones
  abiertas, bloqueo ("Bloqueada hasta las HH:MM", "No bloqueada" o "No disponible").
- Botones, cada uno abre `Confirmacion` (diálogo con "Confirmar" y "Cancelar", foco inicial en
  "Cancelar", `Escape` cancela):
  - "Cerrar todas sus sesiones" (oculto en la ficha propia);
  - "Desbloquear cuenta" (oculto en la ficha propia; deshabilitado si el bloqueo es "No disponible");
  - "Desactivar" o "Reactivar";
  - "Asignar clave temporal" (pide la clave en el diálogo).
- Tras actuar: aviso `role="status"` con el resultado ("Se cerraron 2 sesiones") y la ficha se
  recarga. Errores 409 y 503 con su mensaje.
- "Historial de roles": tabla rol, asignado por, el, retirado por, el.
- "Últimos eventos": las 10 filas de la auditoría de esa persona y enlace a la auditoría filtrada por
  afectado.
- En `/admin/usuarios` cada fila suma el enlace "Ver ficha".
