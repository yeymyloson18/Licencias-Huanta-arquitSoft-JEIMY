# Contrato: pantallas del portal (catálogo y asistente)

Decisiones: [research.md](../research.md) §R-09 y §R-12. Todas las pantallas se diseñan primero
para el celular: se usan bien desde 360 px, sin desplazamiento horizontal y sin estilos en línea
(por la CSP de la 002).

## Rutas

| Ruta | Acceso | Contenido |
|---|---|---|
| `/` | pública | Inicio con la lista de la 001. Cada tarjeta enlaza a `/licencias/:codigo` y hay un botón "¿Qué licencia necesito?" que lleva a `/asistente` |
| `/asistente` | pública | Una pregunta por pantalla; la propuesta al final |
| `/licencias/:codigo` | pública | La ficha de la licencia |
| `/admin/catalogo` | ADMINISTRADOR | Lista de las 12 recetas con su estado (activa o desactivada), tasa y plazo |
| `/admin/catalogo/:codigo` | ADMINISTRADOR | Formulario de edición |

El menú del personal agrega "Catálogo" para el rol ADMINISTRADOR.

## `/asistente`

- **Estado en la URL** (`?CODIGO=valor&…`, en el orden de las preguntas). La pregunta actual es la
  primera sin respuesta válida, y se descartan los parámetros desconocidos o inválidos.
- **Cada pregunta:**
  - `<h1>` con el texto de la pregunta, que recibe el foco al llegar;
  - el avance "Pregunta N de 3" en una región `aria-live="polite"`;
  - las opciones como `radio` dentro de un `fieldset` y su `legend`.
- **Botones:**
  - "Siguiente": deshabilitado mientras no haya una opción elegida.
  - "Volver": desde la pregunta 2; quita la última respuesta.
  - "Empezar de nuevo": deja la URL limpia.
- **Al tener las tres respuestas** se llama a `POST /asistente/proponer`:
  - `PROPUESTA`: muestra `FichaLicencia`, el aviso "Esta propuesta es orientativa: la municipalidad
    confirma el nivel de riesgo al evaluar tu solicitud" (FR-008), "Volver" y "Empezar de nuevo".
  - `NO_DETERMINADA` (cualquier motivo): "No pudimos determinar tu licencia con tus respuestas.
    Acércate a la Subgerencia de Comercio, Licencias y Control Sanitario.", con "Volver" y
    "Empezar de nuevo".
- **Si el servicio no está disponible:** muestra un mensaje sin detalles técnicos y "Reintentar".
- **Mientras carga:** indica que está cargando y desactiva los botones para que no se pulse dos
  veces.

## `FichaLicencia` (componente compartido)

| Dato | Se muestra como |
|---|---|
| Tasa | `S/ 177.10`, o "Gratuito" si es `0.00` |
| Plazo | "2 días hábiles" / "N días calendario"; se omite si es null |
| Calificación | "Aprobación automática" / "Evaluación previa con silencio positivo" / "Servicio prestado en exclusividad" |
| ITSE | "Posterior, hasta 9 días hábiles" / "Previa, hasta 7 días hábiles" / "Se notifica dentro de 6 meses"; se omite si es null |
| Vigencia | "Indeterminada" (null en una licencia) / "Provisional de 12 meses"; se omite en los trámites conectados |
| Requisitos | Lista ordenada (`<ol>`). Los condicionales llevan una etiqueta: "Solo si actúa un representante", "Solo si tu giro lo exige", "No se pide si presentaste planos en los últimos 5 años y la edificación no cambió" |

Los textos de esta tabla traducen enumeraciones del contrato y viven en el portal. Los números y los
textos de los requisitos vienen siempre de la API (FR-012).

En `/licencias/:codigo`, un 404 muestra "Esta licencia no está disponible" y un enlace al catálogo.

## `/admin/catalogo/:codigo`

- **Datos fijos (solo lectura):** código, nombre, tipo, ruta y código del TUPA.
- **Campos editables:**
  - tasa (texto con formato de soles);
  - plazo;
  - calificación y orden del ITSE (selects que solo ofrecen los valores válidos para la ruta,
    aunque la API valida igual);
  - plazo del ITSE;
  - vigencia (vacía = indeterminada);
  - interruptor "Activa".
- **Requisitos:** lista editable con agregar, quitar, subir, bajar, texto (máximo 500), obligatorio
  y condición.
- **Al guardar:**
  - Si no cambió nada, muestra "No hay cambios para guardar" y no llama a la API.
  - Si responde 422, muestra cada error junto a su campo (según `errores[].campo`) y un resumen
    enfocable arriba.
  - Si responde 401, lleva a `/ingresar` sin perder el formulario (la 002 ya renueva la sesión);
    si responde 403, muestra un aviso de permiso.
- **Después de guardar:** muestra "Cambios guardados. El catálogo público se actualiza en 5 minutos
  como máximo." (FR-024).

## Pruebas del portal (Jest + Testing Library)

- **Asistente:**
  - avance;
  - "Siguiente" deshabilitado sin opción;
  - "Volver" conserva la respuesta;
  - "Empezar de nuevo";
  - recarga con la URL a medias;
  - las dos formas del resultado;
  - el error con reintento;
  - el foco al cambiar de pregunta.
- **Ficha:** "Gratuito", "Indeterminada", las etiquetas de los requisitos condicionales y el 404.
- **Edición:**
  - errores junto a cada campo;
  - reordenar requisitos;
  - el aviso de "sin cambios";
  - la ruta protegida por rol.
