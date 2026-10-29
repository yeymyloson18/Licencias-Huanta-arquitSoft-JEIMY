# Sistema de Trámite de Licencias de Funcionamiento – Municipalidad Provincial de Huanta

## Estudiante: Sulca Ccorimanya, Jeimy Gregori – Código 27190105

## Descripción
Sistema web que guía al administrado para obtener su licencia de funcionamiento en la
Municipalidad Provincial de Huanta: le dice qué licencia le corresponde, qué documentos presentar,
cuánto pagar y cuánto demora; genera la **esquela de pago** para pagar en la caja municipal,
controla los plazos en días hábiles, registra la inspección ITSE y emite la licencia digital con código QR.

## Idea central: Un motor, nueve recetas
Las nueve licencias del TUPA 2024 siguen casi los mismos pasos. Lo que cambia (requisitos, tasa,
plazo, calificación, orden del ITSE y vigencia) se guarda como **datos en un catálogo de recetas**,
y un único **motor de trámites** sigue la receta que corresponde (ADR-002).

## Documentación del proyecto (Sprint 1)

| N.° | Documento | Ubicación |
|---|---|---|
| 1 | Necesidad del negocio | [`docs/01-analisis-de-sistema/00-necesidad-del-negocio.md`](docs/01-analisis-de-sistema/00-necesidad-del-negocio.md) |
| 2 | Actores | [`docs/01-analisis-de-sistema/01-actores.md`](docs/01-analisis-de-sistema/01-actores.md) |
| 3 | Historias de usuario | [`docs/01-analisis-de-sistema/02-historias-de-usuario.md`](docs/01-analisis-de-sistema/02-historias-de-usuario.md) |
| 4 | Requisitos funcionales | [`docs/01-analisis-de-sistema/03-requisitos-funcionales.md`](docs/01-analisis-de-sistema/03-requisitos-funcionales.md) |
| 5 | Atributos de calidad | [`docs/01-analisis-de-sistema/04-atributos-de-calidad.md`](docs/01-analisis-de-sistema/04-atributos-de-calidad.md) |
| 6 | Restricciones | [`docs/01-analisis-de-sistema/05-restricciones.md`](docs/01-analisis-de-sistema/05-restricciones.md) |
| 7 | Drivers arquitectónicos | [`docs/01-analisis-de-sistema/06-drivers-arquitectonicos.md`](docs/01-analisis-de-sistema/06-drivers-arquitectonicos.md) |
| 8 | Decisiones arquitectónicas (ADR) | [`docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`](docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md) |
| 9 | Escenarios de atributos de calidad | [`docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md`](docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md) |
| 10 | Arquitectura inicial | [`docs/02-arquitectura-software/arquitectura-inicial.md`](docs/02-arquitectura-software/arquitectura-inicial.md) |
| 11 | Estilo arquitectónico | [`docs/02-arquitectura-software/estilo-arquitectonico.md`](docs/02-arquitectura-software/estilo-arquitectonico.md) |
| 12 | Enfoque arquitectónico (Clean Architecture) | [`docs/02-arquitectura-software/enfoque-arquitectonico.md`](docs/02-arquitectura-software/enfoque-arquitectonico.md) |
| 13 | Componentes arquitectónicos | [`docs/02-arquitectura-software/componentes-arquitectonicos.md`](docs/02-arquitectura-software/componentes-arquitectonicos.md) |
| 14 | Diseño interno (módulos, patrones y principios) | [`docs/03-diseno-de-software/diseno-interno/`](docs/03-diseno-de-software/diseno-interno/) |
| 15 | Modelo C4 (niveles 1 a 4) | [`docs/04-modelo-c4/`](docs/04-modelo-c4/) |
| 16 | Ejemplo de código (Clean Architecture) | [`tecnologia/README.md`](tecnologia/README.md) |

## Cambios de alcance (simplificación)

| Cambio | Motivo |
|---|---|
| El inspector trabaja siempre con internet desde su celular | Se elimina el modo sin conexión y la aplicación instalable. |
| No hay pagos digitales | El TUPA indica el pago en la caja municipal; el sistema genera una esquela de pago y el personal de caja registra el pago. |
| Atributos de calidad reducidos a seis | Rendimiento, seguridad, disponibilidad, escalabilidad, usabilidad y mantenibilidad. |
| Sin integración con SIAF | Queda fuera de alcance. |
| Sin recursos de reconsideración ni apelación | Quedan fuera del alcance del sistema. |
| Sin bitácora ni versionado del catálogo | El administrador actualiza las recetas; cada esquela guarda el monto con el que se generó. |

## Mejoras para la Fase 2 (fuera del Sprint 1)

| Idea | Motivo para dejarla después |
|---|---|
| Asistente por chat y WhatsApp | Definido como Fase 2 desde el inicio (RC13). |
| Bitácora y versionado del catálogo | Mejora útil, pero no es necesaria para el trámite básico. |

## Curso: Arquitectura de Software – UNSCH 2026