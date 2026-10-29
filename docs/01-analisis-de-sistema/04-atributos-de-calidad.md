# Atributos de calidad

**Escenario crítico:** durante una campaña de formalización o en las fechas de renovación del ITSE,
muchas personas consultan y presentan solicitudes al mismo tiempo.
Meta de diseño: de 1,000 usuarios simultáneos en operación normal a 10,000 en picos
(supuesto que debe validarse con la Municipalidad).

| ID | Atributo | Descripción |
|---|---|---|
| AC01 | Rendimiento | La consulta del catálogo y del estado del trámite debe responder rápidamente aun con alta concurrencia. |
| AC02 | Seguridad | El personal debe ingresar con segundo factor (OTP); las comunicaciones deben viajar cifradas con TLS 1.3 y los datos sensibles cifrados con AES-256. |
| AC03 | Disponibilidad | El sistema debe seguir operando si falla una instancia del servidor (mínimo dos instancias). |
| AC04 | Escalabilidad | El sistema debe pasar de 1,000 a 10,000 usuarios simultáneos agregando instancias, sin rediseñarse. |
| AC05 | Usabilidad | El administrado debe poder hacer su trámite desde el celular, guiado por el asistente de ruta, sin ayuda presencial. |
| AC06 | Mantenibilidad | Los módulos deben estar separados y las reglas del TUPA deben estar en un catálogo, para cambiar una parte sin afectar a las demás. |