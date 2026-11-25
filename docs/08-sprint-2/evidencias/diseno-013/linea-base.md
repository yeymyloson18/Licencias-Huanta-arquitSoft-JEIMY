# Medida de Lighthouse del portal (013)

Fecha: 2026-11-25 16:01 UTC. Sistema: http://localhost:8090 (compose
aislado `licencias-medida`, sin el proveedor de IA). Lighthouse en modo móvil 360×740,
`deviceScaleFactor: 2`, con la mediana de 3 corridas por pantalla. Resultados tal
como salieron.

| Pantalla | Modo | Rendimiento (mediana) | Corridas | Accesibilidad (mediana) | Auditorías de accesibilidad fallidas |
| --- | --- | --- | --- | --- | --- |
| Portada | claro | 97 | 97, 97, 97 | 100 | — |
| Asistente | claro | 98 | 98, 98, 98 | 100 | — |
| Consulta | claro | 98 | 98, 98, 98 | 100 | — |
| Ingresar | claro | 99 | 99, 99, 99 | 100 | — |
| Chat abierto (snapshot) | claro | — | —, —, — | 100 | — |
| Bandeja (EVALUADOR) | claro | 98 | 98, 98, 98 | 100 | — |
| Tablero (JEFATURA) | claro | 98 | 98, 98, 98 | 100 | — |

El chat abierto se mide en modo snapshot: Lighthouse no da rendimiento en ese modo.

## Peso descargado (primera corrida de cada pantalla, con la caché vacía)

| Pantalla | Modo | CSS transferido | CSS sin comprimir | JS transferido | JS sin comprimir |
| --- | --- | --- | --- | --- | --- |
| Portada | claro | 5.4 KB | 17.0 KB | 151.0 KB | 446.5 KB |
| Asistente | claro | 5.4 KB | 17.0 KB | 151.0 KB | 446.5 KB |
| Consulta | claro | 5.4 KB | 17.0 KB | 151.0 KB | 446.5 KB |
| Ingresar | claro | 5.4 KB | 17.0 KB | 151.0 KB | 446.5 KB |
| Bandeja (EVALUADOR) | claro | 5.4 KB | 17.0 KB | 151.0 KB | 446.5 KB |
| Tablero (JEFATURA) | claro | 5.4 KB | 17.0 KB | 151.0 KB | 446.5 KB |

## Tamaño de la compilación al instalar CoreUI (T006)

Salida de `npm run build -w apps/web` con el tema nuevo (`tema.scss`). Todavía no hay pantallas
cambiadas, así que el JS es el mismo:

| Archivo | Sin comprimir | Gzip |
| --- | --- | --- |
| CSS (`index-*.css`) | 116.34 KB | 18.62 KB |
| JS (`index-*.js`) | 457.26 KB | 127.78 KB |

Antes de CoreUI, el CSS descargado era de 17.0 KB sin comprimir (5.4 KB transferidos, tabla de
arriba).

**Cómo se redujo el tema**: solo se importan las partes usadas. Las utilidades se acotaron (solo
`display` tiene versiones por ancho de pantalla) y se excluyeron `type`, `grid` y `nav`. El menú
lateral y las migas van aparte, en `tema-personal.scss` (4.4 KB con gzip), que no descarga el
portal público. Así el tema pasó de 28.2 KB con gzip (primer intento) a 18.6 KB. El retiro de lo
que CoreUI reemplaza en `global.css` (T035) lo reducirá más. La medida "después" (T045) dirá si
SC-003 se cumple.
