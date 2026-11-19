Funcionalidad 004: Presentar solicitud y consultar el estado del trámite.

Cubre: HU02, HU05; RF03, RF04, RF06, RF07; casos de uso CU03, CU04, CU06 y CU12; escenarios EQ-01, EQ-04 y EQ-05; ADR-002 (motor único + catálogo de recetas), ADR-007 (seguridad por capas) y Ley N.° 29733 (datos personales). Issues de GitHub: #5 (HU02) y #8 (HU05). Usa el catálogo de la 003 y la seguridad de la 002.

Como administrado quiero confirmar mi identidad y llenar un formulario que solo me pida los documentos de mi licencia, para que nadie presente un trámite a mi nombre y para no presentar requisitos innecesarios.

Como administrado quiero consultar el estado de mi trámite con mi número de expediente y mi DNI/RUC desde el celular, para no hacer colas y sin que otra persona vea mis datos.

Como personal de mesa de partes quiero registrar la solicitud de quien viene en persona, para que el trámite presencial siga el mismo camino que el trámite en línea (RC12).

Qué debe cumplir:

1. Antes de presentar en línea, el administrado confirma su identidad: RUC más DNI con su fecha de emisión, o carné de extranjería. Si actúa un representante legal o apoderado, también se piden su documento y la carta poder o el poder inscrito en SUNARP (como documento adjunto). El sistema valida los datos con un servicio externo de DNI/RUC y envía un código OTP de 6 dígitos al celular del solicitante. Con el código correcto recibe un permiso de identidad válido por 15 minutos para presentar la solicitud.

2. El servicio externo de DNI/RUC aún no está contratado: en la Fase 1 se usa un adaptador simulado detrás de un puerto, que se puede reemplazar por el real sin tocar las reglas del negocio. Si el servicio no responde, el sistema lo dice con claridad y sugiere acudir a mesa de partes; no deja presentar sin identidad confirmada.

3. Se limitan los intentos: verificación de identidad y OTP con el mismo esquema de la 002 (contador atómico, falla cerrado si Redis no está disponible).

4. El administrado elige la licencia (o llega desde la propuesta del asistente o desde la ficha de la 003). El formulario pide los datos del titular y del establecimiento (nombre comercial, giro, dirección, zona y área) y solo los documentos de los requisitos de esa receta. Los requisitos condicionales aparecen solo cuando aplican (por ejemplo, "solo si actúa un representante"). No se puede presentar con un requisito obligatorio sin su documento.

5. Los documentos se suben uno por uno antes de presentar: solo PDF, JPG o PNG de hasta 10 MB. El sistema comprueba el tipo real del archivo (no solo la extensión) y guarda su huella SHA-256. Un archivo subido que no se usa en 24 horas se descarta.

6. Al presentar, el sistema crea el expediente con un número único y legible (por ejemplo, EXP-2026-000001), asigna la ruta A, B o C según la receta (RF07), guarda el estado REGISTRADO y su primer registro en el historial de estados, y deja un evento "solicitud presentada" para las notificaciones (las envía la funcionalidad 008). La tasa no se cobra aquí: la esquela se genera después, cuando el evaluador confirma el nivel de riesgo (funcionalidad 005/006).

7. Presentar dos veces la misma solicitud por un doble clic o una reconexión no crea dos expedientes (clave de idempotencia).

8. Al terminar, el administrado ve su número de expediente, la licencia, la ruta y qué sigue, y puede guardarlo o imprimirlo.

9. Mesa de partes (con sesión y rol MESA_PARTES) registra la solicitud presencial con el mismo formulario y las mismas validaciones; la identidad la verifica el personal con el documento físico y el servicio externo, sin OTP. Queda registrado qué usuario la registró. El canal del expediente es EN_LINEA o MESA_PARTES.

10. Mesa de partes, evaluador y jefatura ven una bandeja con los expedientes (número, licencia, ruta, estado, titular, fecha) con filtros por estado y ruta, y pueden abrir el detalle con sus documentos. Otros roles reciben 403.

11. Consulta pública del estado (sin cuenta): el administrado ingresa juntos el número de expediente y su DNI, carné de extranjería o RUC. Si coinciden, ve el estado actual en lenguaje sencillo, la licencia, la fecha de presentación y el historial de estados. Si no coinciden, el mensaje es el mismo sin decir cuál de los dos datos falló, y después de 5 intentos fallidos en 15 minutos se bloquea temporalmente (EQ-04).

12. Datos personales (Ley N.° 29733, principio VII): el documento, el RUC, el celular, el correo, la dirección y los datos del representante se guardan cifrados (AES-256-GCM), con huella HMAC para buscar por documento o RUC. Nunca aparecen en URLs, registros de la aplicación ni mensajes de error. La consulta pública muestra solo datos mínimos (no muestra documento, celular ni dirección completos).

13. La consulta del estado responde rápido con muchos usuarios a la vez (EQ-01) y todas las pantallas se usan bien desde el celular, con accesibilidad (EQ-05: identificar la licencia, confirmar la identidad y presentar en 15 minutos o menos).

Fuera de alcance: subsanar observaciones (funcionalidad 006, CU05), evaluar el expediente y confirmar el riesgo (006), esquela y pago (005), cálculo del vencimiento del plazo en días hábiles con feriados (008: el campo queda vacío hasta entonces), notificaciones por correo o SMS al administrado (008), trámites conectados (HU12/RF15, trabajo futuro) y el servicio real de DNI/RUC (se deja el adaptador simulado).

Nota de arquitectura: el módulo tramites usa el catálogo y la seguridad solo a través de sus fachadas; si el cifrado AES-GCM + HMAC de la 002 se necesita en tramites, se mueve a compartido sin cambiar su comportamiento, nunca se importa desde dentro de seguridad.
