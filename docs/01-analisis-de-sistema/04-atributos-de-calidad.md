# Atributos de calidad

**Escenario crítico:** durante una campaña de formalización o en las fechas de renovación del ITSE,
muchas personas consultan, cargan documentos y pagan al mismo tiempo.
**Meta de diseño: de 1,000 usuarios simultáneos en operación normal a 10,000 en picos**
(supuesto que debe validarse con la Municipalidad y confirmarse con pruebas de carga).

| ID | Atributo | Escenario de calidad |
|---|---|---|
| AC01 | Modificabilidad | Cuando cambie el TUPA, el administrador funcional debe poder crear una nueva versión de una licencia sin modificar el código, y los expedientes iniciados deben continuar con su versión original. |
| AC02 | Rendimiento | Con 10,000 usuarios simultáneos, el 95 % de las consultas del catálogo y del estado del trámite debe responder en menos de 2 segundos, y el registro de un pago en menos de 5 segundos. |
| AC03 | Escalabilidad | El sistema debe pasar de 1,000 a 10,000 usuarios simultáneos agregando instancias de forma automática, sin modificar el código ni la arquitectura lógica, y volver a reducirse cuando baje la demanda. |
| AC04 | Disponibilidad | El sistema debe tener una disponibilidad mínima de 99.5 % y seguir operando si falla una instancia del backend o la base de datos principal (conmutación a la réplica). |
| AC05 | Seguridad | El personal debe ingresar con segundo factor (OTP); las comunicaciones deben viajar cifradas con TLS 1.3 y los datos sensibles cifrados con AES-256. |
| AC06 | Confiabilidad | Un reintento de pago por falla de red no debe generar un cobro doble. |
| AC07 | Auditabilidad | Toda consulta o cambio sobre un expediente debe quedar registrado con usuario, fecha y hora, sin posibilidad de edición. |
| AC08 | Usabilidad | El administrado debe poder hacer el trámite desde el celular, guiado por el asistente de ruta. |
| AC09 | Operación sin conexión | El inspector debe registrar la ITSE sin señal, y los datos deben sincronizarse al recuperar la conexión. |
| AC10 | Mantenibilidad | Los módulos deben estar separados para modificar uno sin afectar a los demás. |
| AC11 | Elasticidad | Ante un pico, el sistema debe crear nuevas instancias en pocos minutos y, si se supera la capacidad máxima, ordenar a los usuarios en una sala de espera virtual en lugar de mostrar errores. |