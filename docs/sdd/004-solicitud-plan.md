Plan técnico de la funcionalidad 004 (presentar solicitud y consultar estado). Respeta la constitución v1.0.0 y la arquitectura de las funcionalidades 001 a 003: monolito modular + Clean Architecture (dominio, aplicación, infraestructura, presentación), fachadas entre módulos, sin importaciones cruzadas (dependency-cruiser en CI), contrato primero y modelo de datos por módulo.

1. Módulos y responsabilidades

- seguridad: verificación de identidad del administrado en línea (POST /identidad/verificar y /identidad/verificar-otp). Reutiliza lo que ya existe en la 002: codigo_otp con propósito IDENTIDAD_ADMINISTRADO, la tabla seguridad.verificacion_identidad, el limitador atómico de Redis (falla cerrado) y el enviador de OTP simulado. Emite el tokenIdentidad (JWT de 15 minutos, distinto del token del personal, con un identificador de un solo uso). Expone en su fachada: validar el tokenIdentidad, gastarlo de forma atómica al crear el expediente, y la identidad confirmada (tipo y número de documento, RUC, celular, representante).
- Puerto ServicioIdentificacion (dominio de seguridad) con un adaptador simulado en infraestructura: responde COINCIDE, NO_COINCIDE o NO_DISPONIBLE según datos ficticios fijos documentados en quickstart.md. Con tiempo de espera corto; NO_DISPONIBLE se traduce a 503 del contrato.
- tramites: documentos subidos, presentación de la solicitud (en línea y mesa de partes), bandeja, detalle y consulta pública. Usa el catálogo solo por la fachada de catalogo (receta activa con requisitos) y la seguridad solo por su fachada.
- Cifrado: mover el protector AES-256-GCM + HMAC de seguridad/infraestructura a compartido/infraestructura sin cambiar su comportamiento ni sus claves (las pruebas de la 002 deben seguir pasando). El dominio de tramites solo conoce un puerto ProtectorDatos.

2. Contrato primero (docs/06-contrato-api/openapi.yaml y packages/contracts), antes del código

- Revisar y ajustar si hace falta: /identidad/verificar, /identidad/verificar-otp, /documentos, POST y GET /expedientes, /expedientes/consultar, GET /expedientes/{numeroExpediente} y /expedientes/{numeroExpediente}/documentos/{documentoId}.
- POST /expedientes: 201 con ExpedienteRegistrado; 401 sin token; 403 rol distinto de MESA_PARTES; 409 si el tokenIdentidad ya se gastó en otra solicitud; 422 con la lista de requisitos faltantes (sin datos personales en el mensaje). Cabecera Idempotency-Key obligatoria: el mismo valor con el mismo cuerpo devuelve el mismo expediente (guardar la clave y la huella del cuerpo; con otro cuerpo, 422).
- /expedientes/consultar: 200 EstadoPublico (estado en lenguaje sencillo, licencia, ruta, fecha de presentación e historial; sin documento, RUC, celular, correo ni dirección); 404 único para cualquier dato que no coincida; 429 con Retry-After.
- No se usa tokenConsulta en esta funcionalidad (las descargas del administrado son de la 005 y la 009); si el contrato lo exige en EstadoPublico, dejarlo opcional.
- Actualizar la matriz de permisos de docs/06-contrato-api/README.md si cambia algo.

3. Modelo de datos: migración 0006 (sin tocar 0001 a 0005) y docs/05 actualizados en el mismo commit (la prueba esquema-equivalente debe pasar)

- tramites.expediente: columna receta_al_presentar jsonb NOT NULL con la tasa, el plazo, la calificación, el orden del ITSE y los requisitos vigentes al presentar (FR-017). Secuencia tramites.secuencia_expediente para el correlativo único que no se reinicia (FR-016; pueden quedar huecos si una transacción falla, eso es aceptable). Restricción del formato EXP-AAAA-NNNNNN.
- tramites.documento_temporal: archivos subidos antes de presentar (clave de almacén, tipo real, tamaño, sha256, subido_en, quién lo subió: id de verificación o usuario de mesa de partes). Al presentar se pasan a tramites.documento con su requisito, en la misma transacción. Una tarea programada descarta los de más de 24 horas (comun.ejecucion_tarea con pg_try_advisory_lock, como el reloj de plazos de ADR-006).
- tramites.clave_idempotencia (clave, huella del cuerpo, numero_expediente, creada_en) con unicidad por clave.
- tramites.auditoria: ampliar la restricción de accion con PRESENTAR_EN_LINEA y VER_DETALLE (REGISTRAR_PRESENCIAL ya existe).
- Revisar seguridad.verificacion_identidad: agregar lo necesario para el uso único del permiso (por ejemplo, usada_en) si no existe.

4. Dominio de tramites (funciones puras, sin NestJS ni Prisma)

- Expediente (agregado): se crea solo REGISTRADO, con ruta desde la receta y el primer registro de historial.
- PoliticaRequisitos: dada la receta y si actúa un representante, decide qué requisitos son obligatorios, cuáles opcionales y cuáles no aplican (aclaración 3); y devuelve los faltantes.
- NumeroExpediente (objeto de valor) con formato y normalización (mayúsculas, sin espacios).
- Validaciones: área de bodega ≤ 50 m², licencia activa y no trámite conectado.
- EstadoPublico: texto sencillo por estado (tabla en el dominio).

5. Aplicación de tramites (casos de uso)

- SubirDocumento: comprueba el tipo real por los primeros bytes (PDF, JPG, PNG), el tamaño ≤ 10 MB, calcula SHA-256 y guarda por el puerto AlmacenArchivos.
- PresentarSolicitud (en línea y presencial): en una sola transacción: verifica la idempotencia, gasta el tokenIdentidad (en línea), valida requisitos contra la receta vigente, crea el expediente con el número, mueve los documentos, guarda el historial, la auditoría y el evento SolicitudPresentada en comun.evento_pendiente (outbox de ADR-005). Si algo falla, no queda nada.
- ListarExpedientes (paginado, filtros por estado y ruta, del más reciente al más antiguo) y ObtenerDetalleExpediente (registra VER_DETALLE en la auditoría).
- ConsultarEstado: busca por número y HMAC del documento o del RUC; limitador por IP (5 fallos en 15 minutos, contador atómico, falla cerrado). La IP sale solo de trust proxy configurado (TRUST_PROXY_SALTOS); nunca se confía en X-Forwarded-For enviado directamente a la API.

6. Infraestructura

- AlmacenArchivos: puerto con un adaptador de disco local en un volumen de Docker para desarrollo (fuera de la carpeta pública del portal). El adaptador compatible con S3 queda para la 010. Los archivos se sirven solo por la API con autorización, con Content-Disposition attachment y X-Content-Type-Options nosniff.
- Límite de tamaño en Multer y en nginx (client_max_body_size 11m).
- Caché: la consulta pública no se guarda en caché compartida (Cache-Control: no-store), porque tiene datos del titular.

7. Portal (React)

- /tramite/identidad → /tramite/solicitud?licencia=CODIGO → /tramite/comprobante (el número de expediente puede ir en la ruta; nunca el documento). El tokenIdentidad se guarda solo en memoria (no en localStorage). Botón "Presentar solicitud" en la ficha y en la propuesta del asistente de la 003.
- /consulta: formulario con POST; el número y el documento no aparecen en la dirección.
- /personal/expedientes y /personal/expedientes/:numero (bandeja y detalle) y /personal/mesa-partes/nueva (registro presencial), protegidas por rol.
- Se conserva lo escrito si vence el permiso o la sesión (FR del caso límite), sin guardar datos personales en el navegador más allá de la memoria de la pestaña.

8. Pruebas (principio V, cobertura ≥ 80 %)

- Unitarias del dominio: PoliticaRequisitos para las 9 licencias (SC-006), NumeroExpediente, estados públicos.
- Integración (Supertest + PostgreSQL y Redis reales): flujo completo en línea; presencial; doble envío y 10 envíos en paralelo con la misma clave → un solo expediente (SC-007); token gastado → 409; permiso vencido; matriz 401/403 de todos los endpoints nuevos (SC-003); fuerza bruta en consulta e identidad → 429 en el 6.º intento (SC-004); servicio de identificación NO_DISPONIBLE → 503; archivos renombrados y > 10 MB (SC-008); transacción atómica (fallo a mitad → nada guardado).
- Prueba de privacidad (SC-005): capturar los registros de la aplicación durante el flujo y comprobar que no aparece ningún documento, RUC, celular, correo ni dirección de los datos de prueba.
- Portal: pruebas de componentes de formulario, identidad, consulta y bandeja.
- k6: tests/carga/eq01-consulta.js para la consulta del estado (100 y 1,000 usuarios), con expedientes de prueba sembrados y sin chocar con el limitador (usar consultas correctas).
- Lighthouse móvil ≥ 90 en accesibilidad y buenas prácticas para identidad, formulario, comprobante y consulta.

9. Documentación

- Actualizar ADR-007 si cambia algo de los tokens; README (funcionalidad 004 y cómo probar con los datos ficticios del servicio simulado); diagrama de casos de uso (CU03, CU04, CU06 y CU12 a Hecho al terminar).
