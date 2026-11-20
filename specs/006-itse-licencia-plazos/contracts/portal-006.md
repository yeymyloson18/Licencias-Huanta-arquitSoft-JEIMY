# Contrato del portal (006)

Todas las pantallas se usan a 360 px sin desplazamiento horizontal. Nada personal va en la URL.

| Ruta | Quién | Qué hace |
| --- | --- | --- |
| `/personal/inspecciones` | JEFATURA, INSPECTOR | Jefatura: lista con filtro por estado; en cada pendiente o asignada, "Asignar" (inspector de la lista y fecha). Inspector: tarjetas de sus inspecciones con dirección, giro y fecha; "Registrar resultado" abre el formulario |
| `/personal/inspecciones/:id/resultado` | INSPECTOR asignado | Resultado (FAVORABLE o DESFAVORABLE), observaciones, fotos con `<input type="file" accept="image/jpeg,image/png" capture="environment" multiple>` (1 a 5, vista previa y quitar), y con FAVORABLE el número y la fecha del certificado. Al enviar muestra el resultado y vuelve a la bandeja |
| `/personal/alertas` | JEFATURA | Alertas sin atender, la más urgente primero ("Vencido" o "Quedan N días hábiles"), enlace al expediente y "Marcar como atendida" |
| `/admin/feriados` | ADMINISTRADOR | Selector de año, lista, formulario (fecha, descripción, alcance) y "Eliminar" con confirmación en la página (sin diálogos del navegador) |
| `/verificar/:codigo` | Pública | Datos mínimos de la licencia (o "No encontramos una licencia con ese código"; con 429, la hora para reintentar) |
| `/consulta` | Pública | Con licencia: número y "Descargar licencia" (PDF con el `tokenConsulta`) |
| `/personal/expedientes/:numero` | MESA_PARTES, EVALUADOR, JEFATURA | Si tiene licencia: número y "Descargar licencia" |

Menú: "Inspecciones" (JEFATURA, INSPECTOR), "Alertas" (JEFATURA), "Feriados" (ADMINISTRADOR).
