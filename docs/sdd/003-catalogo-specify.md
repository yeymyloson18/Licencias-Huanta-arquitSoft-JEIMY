Funcionalidad 003: Catálogo y Asistente de ruta.



Cubre: HU01, HU03, HU14; RF01, RF02, RF05, RF21; casos de uso CU01, CU02 y CU24; escenarios EQ-01, EQ-05 y EQ-06; ADR-002 (motor único + catálogo de recetas). Issues de GitHub: #4, #6 y #17.



Como administrado (ciudadano que quiere abrir un negocio) quiero responder tres preguntas sencillas desde mi celular, para saber qué licencia me corresponde, qué documentos presentar, cuánto pago y cuánto demora, antes de ir a la municipalidad.

Como administrador quiero actualizar los requisitos, la tasa, el plazo, la calificación, el orden del ITSE y la vigencia de cada receta, para aplicar los cambios del TUPA sin programar.



Qué debe cumplir:

1\. El asistente muestra las tres preguntas en orden, una por una, con lenguaje sencillo y opciones para elegir. Las preguntas y sus opciones vienen del catálogo, no están escritas en el código.

2\. Con las tres respuestas, el sistema propone una licencia aplicando reglas guardadas como datos (la primera regla que coincide, por prioridad). Si ninguna regla coincide, lo dice con claridad y sugiere acudir a la municipalidad.

3\. Para la licencia propuesta (y para cualquier licencia del catálogo) se muestra: nombre, requisitos (indicando cuáles son condicionales, por ejemplo "solo si actúa un representante"), tasa en soles, plazo en días hábiles, si la aprobación es automática o con evaluación previa, cuándo es la inspección ITSE y la vigencia.

4\. La tasa se toma siempre del catálogo vigente; nunca está escrita en el código (RF05).

5\. El administrado puede volver atrás y cambiar una respuesta, o empezar de nuevo.

6\. El administrado no necesita iniciar sesión para usar el asistente ni consultar el catálogo.

7\. El administrador (con sesión y rol ADMINISTRADOR) puede editar una receta: tasa, plazo, calificación, orden del ITSE, plazo del ITSE, vigencia, activa/inactiva y sus requisitos (agregar, quitar, reordenar, cambiar texto y condición).

8\. Un cambio del administrador se refleja en el asistente y en el catálogo público sin programar ni reiniciar el sistema, en un tiempo máximo conocido y documentado (EQ-06). Una receta desactivada no se propone ni se muestra al público.

9\. Cada cambio de una receta queda registrado: quién, cuándo y qué valores tenía antes y después.

10\. El administrador no puede guardar una receta inválida (por ejemplo, una tasa negativa o una licencia sin ruta).

11\. Las pantallas del asistente, del detalle de licencia y de edición de recetas se usan bien desde el celular (EQ-05) y cumplen accesibilidad.

12\. El catálogo y el asistente responden rápido con muchos usuarios a la vez (EQ-01).



Fuera de alcance: crear o borrar recetas (las 12 recetas del TUPA ya existen), editar las preguntas o reglas del asistente desde el portal (se cambian por migración mientras la Municipalidad responde la duda N.° 2 del documento 09), la presentación de la solicitud y el formulario dinámico (funcionalidad 004).



Nota: las tres preguntas y sus reglas son una propuesta pendiente de validar con la Municipalidad (duda N.° 2 de docs/01-analisis-de-sistema/09-validacion-del-tupa.md).

