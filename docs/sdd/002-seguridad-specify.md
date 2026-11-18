Funcionalidad 002: Seguridad y Usuarios del personal municipal.



Cubre: HU15, RF16, RF17, RF22; escenario EQ-04; ADR-007; Ley N.° 29733.



Como personal municipal (mesa de partes, evaluador, inspector, caja, jefatura o administrador) necesito iniciar sesión de forma segura, para que solo yo pueda hacer las operaciones de mi rol.

Como administrador necesito crear usuarios, desactivarlos y asignarles roles, para que cada persona haga solo lo que le corresponde.



Qué debe cumplir:

1\. Inicio de sesión en dos pasos: correo y clave; si son correctos, se envía un código OTP de 6 dígitos al celular del usuario. El código vence a los 5 minutos y admite 5 intentos.

2\. Con el OTP correcto, el usuario recibe una sesión de corta duración que puede renovar y cerrar. Cerrar sesión invalida la renovación.

3\. Cinco intentos fallidos en 15 minutos (de clave o de OTP) bloquean temporalmente; el sistema indica cuándo reintentar, sin decir si falló el correo, la clave o el código.

4\. Un usuario desactivado no puede iniciar sesión, y sus sesiones abiertas dejan de servir.

5\. Control de permisos por rol reutilizable por todos los módulos: una operación protegida responde "no autenticado" sin sesión válida y "sin permiso" con un rol insuficiente (EQ-04).

6\. El administrador puede listar, crear, editar (nombre, celular, activo) y asignar roles a los usuarios. Un usuario puede tener varios roles. Se registra quién asignó cada rol y cuándo.

7\. El sistema no puede quedarse sin ningún administrador activo.

8\. El primer administrador se crea al instalar el sistema, sin dejar ninguna clave real en el repositorio.

9\. El portal web tiene la pantalla de inicio de sesión (correo y clave, luego código) y la pantalla de gestión de usuarios para el administrador, usables desde el celular.

10\. Las claves y los códigos OTP nunca se guardan ni se registran en claro; el celular se guarda cifrado. Ningún dato personal aparece en URL, logs ni mensajes de error.

11\. Mientras no haya proveedor de SMS contratado, el envío del OTP usa un adaptador simulado detrás de un puerto, que se puede reemplazar sin tocar los casos de uso.



Fuera de alcance: verificación de identidad del administrado con DNI/RUC (va en la funcionalidad de presentar solicitud), recuperación de clave por correo y auditoría de trámites.

