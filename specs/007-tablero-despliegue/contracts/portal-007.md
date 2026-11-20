# Contrato del portal (007): `/personal/tablero`

- **Acceso**:
  - ruta protegida con el rol `JEFATURA`;
  - opción "Tablero" en el menú del personal, solo para JEFATURA;
  - sin sesión, el portal lleva al ingreso; con otro rol, muestra el aviso de que no tiene permiso.
- **Rango**:
  - dos campos de fecha, "Desde" y "Hasta", con el mes actual por defecto, y el botón "Ver tablero";
  - los errores de validación (422) se muestran junto a los campos;
  - el rango elegido no va en la URL de la API como dato personal; las fechas no lo son, así que van
    como parámetros de consulta.
- **Secciones**, cada una con encabezado `h2`:
  1. **Expedientes por estado**:
     - gráfico de barras horizontales en SVG, con `role="img"`, `<title>` y un `aria-describedby` que
       apunta a un resumen en texto (por ejemplo, "12 expedientes: 5 en evaluación, 4 pagados…");
     - debajo, una tabla `Estado | Cantidad` con los nombres de estado en lenguaje sencillo (los de
       `ESTADOS`).
  2. **Tiempo de atención frente al plazo del TUPA**:
     - tabla `Licencia | Plazo TUPA | Atendidos | Promedio (días hábiles) | Dentro del plazo`;
     - el promedio se muestra con un decimal; "Sin datos" si es `null`; "No aplica" para un plazo 0;
     - un gráfico de barras del promedio, con una marca del plazo y el mismo texto alternativo.
  3. **Ingresos en caja**:
     - el total en soles con formato `S/ 1,234.50` (`es-PE`);
     - una tabla `Licencia | Monto`.
- **Reporte de licencias**:
  - selector "Situación" (Vigentes, En trámite, ITSE por vencer), "Licencia" (opcional), "Giro" y
    "Zona" (texto opcional) y el botón "Ver reporte";
  - tabla con las columnas de `FilaReporte`;
  - "Descargar CSV" descarga el archivo con el nombre que manda el servidor;
  - si llega `X-Reporte-Truncado: true`: "Se muestran las primeras 5,000 filas; ajusta los filtros".
- **Estados**: "Cargando…" (`role="status"`), error (`role="alert"`) y vacío ("No hay datos en este
  rango").
- **360 px**: sin desplazamiento horizontal. Las tablas anchas van en un contenedor con desplazamiento
  propio, etiquetado y con `tabindex="0"`.
- **Privacidad**: solo se muestra el titular público abreviado que manda el servidor.
