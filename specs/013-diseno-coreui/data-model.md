# Modelo de datos: Diseño visual del portal con CoreUI (013)

**Sin cambios en el backend, en la base de datos ni en el contrato.** La 013 solo agrega estado
del portal.

## Preferencia de modo de color

| Dónde | Clave | Valores | Notas |
| --- | --- | --- | --- |
| `localStorage` del navegador | `licencias-modo-color` | `"claro"` \| `"oscuro"` (ausente = sin elección) | Se lee y se escribe dentro de `try/catch`. No es un dato personal ni viaja a la API. Se conserva al cerrar sesión. |
| `<html data-coreui-theme>` | — | `light` \| `dark` \| (sin atributo) | Sin atributo (sin elección), el CSS usa `prefers-color-scheme`. |

**Transiciones** (`useModoColor`):

Corrección del 2026-11-25: solo dos modos; la preferencia del dispositivo es el valor inicial.

```text
sin elección ──────────────► modo = el del dispositivo (sin atributo; el CSS lo resuelve)
sin elección ──el dispositivo cambia──► el botón muestra el nuevo modo (sigue sin atributo)
"claro" ──alterna──► data-coreui-theme="dark",  guarda "oscuro"
"oscuro" ─alterna──► data-coreui-theme="light", guarda "claro"
con elección ──el dispositivo cambia──► nada: se respeta la elección
almacenamiento bloqueado ──► se aplica solo a la página abierta (sin error)
otra pestaña cambia la clave (evento storage) ──► se aplica aquí también
```

## Estado del menú lateral (React, sin Redux)

| Estado | Tipo | Dónde | Notas |
| --- | --- | --- | --- |
| `abierto` | boolean | `DisenoPersonal` (`useState`) | En pantallas de menos de 768 px. Empieza cerrado y se cierra al elegir una opción, al tocar fuera o con Escape. |
| `plegado` | boolean | `DisenoPersonal` (`useState`) | En escritorio: menú angosto. No se guarda (vuelve a abierto al recargar). |

## Opciones del menú (la misma fuente de hoy)

`componentes/diseno/opcionesMenu.ts` exporta `OPCIONES` (movidas sin cambios desde `Menu.tsx`:
`etiqueta`, `ruta` y `roles`) y `opcionesDe(roles)`. El menú lateral las muestra en el mismo
orden y con las mismas reglas.

## Migas de pan

`migasDe(pathname)` es una función pura en `componentes/diseno/migas.ts`. Devuelve una lista de
`{ etiqueta, ruta | null }` a partir de un mapa fijo de patrones:

| Patrón | Etiqueta |
| --- | --- |
| `/admin` | Panel |
| `/admin/usuarios` | Usuarios |
| `/admin/usuarios/:id` | Ficha del usuario (nunca el nombre, el correo ni el id) |
| `/admin/catalogo` | Catálogo |
| `/admin/catalogo/:codigo` | el código de la receta (`LIC-02`) |
| `/admin/auditoria` | Auditoría |
| `/admin/feriados` | Feriados |
| `/personal/expedientes` | Expedientes |
| `/personal/expedientes/:numero` | el número de expediente |
| `/personal/mesa-partes/nueva` | Registrar solicitud |
| `/personal/caja` | Caja |
| `/personal/inspecciones` | Inspecciones |
| `/personal/inspecciones/:id/resultado` | Resultado de la inspección (sin el id) |
| `/personal/tablero` | Tablero |
| `/personal/alertas` | Alertas |
| `/personal/auditoria` | Auditoría |
| `/perfil` | Mi perfil |

Un tramo desconocido no muestra su texto (puede ser un identificador): se omite.

## Grupo de estado del expediente

`componentes/InsigniaEstado.tsx` tiene el mapa fijo `estado → grupo → clase` de research R-08. Los
13 estados de `EstadoExpediente` del contrato tienen su grupo; un estado nuevo sin grupo usa
`text-bg-secondary` y su nombre del contrato.
