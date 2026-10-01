# Atributos de calidad

**Escenario crítico:** durante una campaña de formalización o en las fechas de renovación del ITSE,
muchas personas consultan y pagan al mismo tiempo. Meta de diseño: 1,000 usuarios simultáneos
(supuesto que debe validarse con la Municipalidad).

| ID | Atributo | Escenario de calidad |
|---|---|---|
| AC01 | Modificabilidad | Cuando cambie el TUPA, el administrador funcional debe poder crear una nueva versión de una licencia sin modificar el código, y los expedientes iniciados deben continuar con su versión original. |
| AC02 | Rendimiento | La consulta del catálogo y del estado del trámite debe responder rápidamente aun con alta concurrencia. |
| AC03 | Escalabilidad | El sistema debe soportar 1,000 usuarios simultáneos agregando réplicas del backend, sin rediseñarlo. |
| AC04 | Disponibilidad | El sistema debe seguir operando si una instancia del servidor falla (mínimo dos instancias). |
| AC05 | Seguridad | El personal debe ingresar con segundo factor (OTP); las comunicaciones deben viajar cifradas con TLS 1.3 y los datos sensibles cifrados con AES-256. |
| AC06 | Confiabilidad | Un reintento de pago por falla de red no debe generar un cobro doble. |
| AC07 | Auditabilidad | Toda consulta o cambio sobre un expediente debe quedar registrado con usuario, fecha y hora, sin posibilidad de edición. |
| AC08 | Usabilidad | El administrado debe poder hacer el trámite desde el celular, guiado por el asistente de ruta. |
| AC09 | Operación sin conexión | El inspector debe registrar la ITSE sin señal, y los datos deben sincronizarse al recuperar la conexión. |
| AC10 | Mantenibilidad | Los módulos deben estar separados para modificar uno sin afectar a los demás. |