# Restricciones

## Legales y normativas
| ID | Restricción | Descripción |
|---|---|---|
| RC01 | TUPA 2024 | Las licencias, requisitos, tasas y plazos se toman del TUPA (Ordenanza Municipal N.° 001-2024-MPH/CM, modificada por el Decreto de Alcaldía N.° 009-2024-MPH/A). El sistema lo lee, no lo define. |
| RC02 | Ley N.° 28976 | Ley Marco de Licencia de Funcionamiento (TUO aprobado por D.S. N.° 163-2020-PCM). |
| RC03 | D.S. N.° 002-2018-PCM | Reglamento de Inspecciones Técnicas de Seguridad en Edificaciones. |
| RC04 | Ley N.° 27444 | Procedimiento Administrativo General: plazos y silencio administrativo positivo. |
| RC05 | Ley N.° 29733 | Protección de Datos Personales: solo se piden y guardan los datos necesarios. |
| RC06 | Matriz de riesgo | El nivel de riesgo lo define la Municipalidad; el sistema solo lo propone y registra. |

## Tecnológicas
| ID | Restricción | Descripción |
|---|---|---|
| RC07 | Aplicación web responsive | Debe funcionar en navegador de computadora y de celular; los inspectores la usan desde su celular con conexión a internet. |
| RC08 | API REST | La comunicación entre el frontend y el backend se realiza mediante una API REST. |
| RC09 | PostgreSQL | La información se almacena en una única base de datos PostgreSQL. |
| RC10 | Despliegue | En la nube o en un centro de datos municipal con capacidades similares. |

## Organizacionales y del proyecto
| ID | Restricción | Descripción |
|---|---|---|
| RC11 | Pago presencial en caja | El TUPA indica el pago en efectivo en la Caja de la Entidad. El sistema genera la esquela de pago; no procesa pagos digitales. |
| RC12 | Atención presencial | La mesa de partes presencial se mantiene para quien no tenga internet. |
| RC13 | Entrega en dos fases | Fase 1: sistema base; Fase 2: asistente por chat, sin rehacer la Fase 1. |
| RC14 | Control de versiones | El proyecto se gestiona con Git y GitHub. |