# Descripción del PR: 004-solicitud-consulta → main

Texto preparado en la tarea T068 para actualizar el PR #31 (no se creó otro PR).

## Qué incluye

Funcionalidad 004: presentar la solicitud y consultar el estado del trámite.

- **Historia 1, presentar en línea:** identidad confirmada con un código al celular (servicio de
  identificación simulado); permiso de 30 minutos y de un solo uso, con su cuenta regresiva en el
  formulario; documentos PDF, JPG o PNG reales de hasta 10 MB; presentación atómica e idempotente
  con número `EXP-AAAA-NNNNNN`; comprobante imprimible.
- **Historia 2, consulta pública:** número de expediente y DNI, carné de extranjería o RUC, por POST;
  estado en lenguaje sencillo, qué sigue e historial; el mismo 404 si el documento no coincide o el
  número no existe; 5 fallos por origen en 15 minutos bloquean (falla cerrado si Redis no responde).
- **Historia 3, mesa de partes:** mismo formulario con la sesión del rol MESA_PARTES; identidad
  comprobada con el servicio sin código; canal, `registrado_por` y auditoría `REGISTRAR_PRESENCIAL`.
- **Historia 4, bandeja del personal:** MESA_PARTES, EVALUADOR y JEFATURA ven todos los expedientes
  con filtros y paginación; detalle con el documento enmascarado y auditoría `VER_DETALLE`; descarga
  de documentos como adjunto.
- **Transversal:** documentos temporales de más de 24 h descartados cada hora (una sola réplica, con
  candado de PostgreSQL); prueba de privacidad de extremo a extremo; migraciones 0006 y 0007.
- **Ajustes de la prueba manual:** etiquetas distintas para "Nombre completo del titular" y "Razón
  social de la empresa (opcional)"; aviso de minutos restantes del permiso (y alerta a los 5
  minutos); punto final en "Qué sigue".

## Verificación

| Puerta                                                       | Resultado                      |
| ------------------------------------------------------------ | ------------------------------ |
| Pruebas unitarias de la API (cobertura ≥ 80 % por archivo)   | 802 en verde                   |
| Pruebas de integración (PostgreSQL y Redis temporales)       | 322 en verde (30 suites)       |
| Pruebas del portal                                           | 211 en verde                   |
| build, lint, formato, regla de dependencia, contrato         | En verde                       |
| gitleaks (historial y árbol de trabajo)                      | 0 hallazgos                    |

En un clon aislado (su propio proyecto de Compose y puertos, datos ficticios):

- **Lighthouse 12 móvil:** accesibilidad 100 en identidad, solicitud, comprobante y consulta; buenas
  prácticas 96 a 100. Sin desplazamiento horizontal a 360 px en las 7 pantallas nuevas.
- **OWASP ZAP (escaneo base):** 0 alertas altas, medias o bajas.
- **k6, consulta pública:** 100 usuarios con p95 15.6 ms y 0 % de errores; 1,000 usuarios con p95
  113.6 ms y 0.02 % de errores (18, sin rastro en la API; se atribuyen a la red de Docker Desktop).
- **Guía de validación:** escenarios 1 a 4, 23 de 23 comprobaciones correctas.
- **2 réplicas de la API:** 6 de 6 solicitudes creadas y 12 de 12 documentos descargados con el mismo
  SHA-256; las dos réplicas atendieron peticiones.
- **Tiempos a 360 px** (recorrido automatizado con pausas de lectura): SC-001 81 s (meta ≤ 15 min) y
  SC-010 47 s (meta ≤ 10 min).

## Pendiente para el entorno desplegado

- **SC-002:** confirmar la carga de la consulta con k6 desde otra máquina (en local, k6 y el sistema
  comparten la computadora).
- **EQ-04:** comprobar TLS 1.3 con testssl.sh (en local no hay TLS).
- **SC-001:** validarlo con personas (la meta es el 90 % de los participantes); la medición de aquí es
  automatizada.
