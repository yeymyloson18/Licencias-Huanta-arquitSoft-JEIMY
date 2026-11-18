Plan técnico de la funcionalidad 002. Respeta la constitución y la base de la 001.



Primero el contrato y el modelo (principios II y III), en el mismo PR:

1\. openapi.yaml: agregar POST /auth/cambiar-clave (clave actual y nueva); POST /usuarios/{usuarioId}/clave-temporal (solo ADMINISTRADOR); campo claveTemporal en NuevoUsuario; campo debeCambiarClave en Usuario y en SesionPersonal; parámetro buscar en GET /usuarios; respuesta 429 con Retry-After cuando se superan los 3 códigos en 15 minutos.

2\. Refresh token en cookie httpOnly, Secure y SameSite=Strict con ruta /api/v1/auth, en lugar del cuerpo JSON, para que un ataque XSS no pueda robarlo. Actualizar el contrato en consecuencia.

3\. Nueva migración 0003 y, en el mismo PR, actualizar docs/05-modelo-de-datos (esquema.sql, modelo-entidad-relacion.md y diccionario): usuario.debe\_cambiar\_clave; usuario\_rol con id propio, retirado\_por y retirado\_en, e índice único parcial (usuario\_id, rol\_codigo) WHERE retirado\_en IS NULL; sesion con ultima\_actividad\_en y vence\_maximo\_en, y rotación del refresh token con detección de reutilización (si se reutiliza uno ya rotado, se cierran todas las sesiones de ese usuario).



Decisiones técnicas:

\- Claves con argon2id (paquete argon2). Códigos OTP: 6 dígitos con crypto.randomInt, guardando solo su hash.

\- Celular cifrado con AES-256-GCM y búsqueda por HMAC-SHA256; claves de cifrado y HMAC desde variables de entorno validadas al arrancar, nunca en el repositorio.

\- Sesión: JWT de acceso de 15 minutos con @nestjs/jwt (sub = id del usuario, roles y versionSeguridad); refresh token opaco aleatorio, guardado solo como hash.

\- Efecto inmediato de desactivar o cambiar roles (FR-011, FR-015): un número versionSeguridad por usuario en Redis, que se incrementa al desactivar, cambiar roles o asignar una clave temporal. El guard compara la versión del token con la de Redis en cada petición; si Redis no responde, consulta PostgreSQL. Así no se consulta la base en cada petición (EQ-01).

\- Límites con Redis (INCR + EXPIRE, compartidos por todas las instancias, FR-009): 5 fallos en 15 minutos por correo (usando su HMAC, nunca el correo en claro) y por IP; 3 códigos por usuario en 15 minutos. Configurar trust proxy en NestJS y X-Forwarded-For en nginx para obtener la IP real.

\- "Nunca sin administrador" (FR-020): verificar y modificar dentro de una transacción con bloqueo (SELECT ... FOR UPDATE sobre los administradores activos), con una prueba de concurrencia.

\- Control de permisos: decorador @Roles(...) y guards JwtAuthGuard y RolesGuard expuestos por la fachada del módulo seguridad, para que los demás módulos los usen sin importar su interior. Respuestas 401 y 403 en problem+json.

\- Envío del OTP: puerto EnviadorOTP. Adaptador simulado que guarda el último código en Redis (clave dev:otp:<usuarioId>, TTL de 5 minutos) para consultarlo en desarrollo con redis-cli, sin logs ni endpoint. La API se niega a arrancar si NODE\_ENV=production y el envío es simulado.

\- Primer administrador: comando npm run crear-administrador -w apps/api que pide los datos de forma interactiva o los lee de variables de entorno; si ya existe un administrador activo, no hace nada.

\- Portal: React Router con /ingresar, /cambiar-clave y /admin/usuarios; token de acceso solo en memoria; renovación automática; menú según los roles.

\- Pruebas: unitarias de dominio (OTP, política de clave, último administrador); integración con Supertest para toda la matriz de la tabla de permisos de docs/06-contrato-api/README.md en los endpoints de usuarios; fuerza bruta (bloqueo exacto en el 6.º intento); prueba de que ninguna respuesta ni log contiene correo, celular, clave ni código.

\- Sin cambios en la regla de dependencia: el módulo seguridad respeta sus 4 capas.

