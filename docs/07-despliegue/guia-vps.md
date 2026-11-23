# Guía paso a paso: publicar el sistema en un servidor (DigitalOcean)

Esta guía es para hacerla una sola vez. Al terminar, el sistema queda en
**https://164-90-143-165.sslip.io** con HTTPS válido. Desde entonces se actualiza solo cada vez que se
aprueba un cambio en `main`.

Cada paso indica **dónde** se escribe el comando:

- **PowerShell**: en su computadora con Windows.
- **Servidor**: dentro del servidor, después de entrar por SSH.

Ningún secreto se guarda en el repositorio. Los secretos viven solo en el archivo `.env` del servidor
y en los secretos de GitHub.

## 1. Crear la llave SSH (PowerShell)

La llave reemplaza a la contraseña para entrar al servidor. Se crean dos archivos:

- la llave **privada**, que nunca se comparte;
- la llave **pública**, que se copia al servidor.

```powershell
ssh-keygen -t ed25519 -C "despliegue-licencias" -f $env:USERPROFILE\.ssh\licencias_ed25519
Get-Content $env:USERPROFILE\.ssh\licencias_ed25519.pub
```

Puede dejar la frase de paso vacía para la llave del despliegue automático. El segundo comando muestra
la llave pública; cópiela para el paso 2.

## 2. Crear el droplet (ya hecho)

El droplet ya está creado. Si hiciera falta crear otro, estos son los valores:

En <https://cloud.digitalocean.com> → **Create → Droplets**:

| Opción | Valor |
| --- | --- |
| Región | La más cercana disponible, por ejemplo Nueva York o San Francisco |
| Imagen | **Ubuntu 24.04 (LTS) x64** |
| Tamaño | Basic, Regular, **2 GB / 1 CPU** |
| Autenticación | **SSH Key** → *New SSH Key* → pegue la llave pública del paso 1 |
| Nombre | `licencias-huanta` |

El droplet del proyecto ya existe: su **IP pública** es `164.90.143.165` y la dirección del sistema es
`https://164-90-143-165.sslip.io`. Los comandos de esta guía ya usan esa IP. Si algún día se crea otro
droplet, reemplace la IP en cada comando.

## 3. Cortafuegos de DigitalOcean (segunda barrera)

En **Networking → Firewalls → Create Firewall**:

- reglas de entrada: **SSH (22)**, **HTTP (80)** y **HTTPS (443)** desde cualquier origen;
- además, **UDP 443** (HTTP/3);
- nada más.

Aplíquelo al droplet `licencias-huanta`.

## 4. Primera entrada y usuario de despliegue (PowerShell, luego servidor)

```powershell
ssh -i $env:USERPROFILE\.ssh\licencias_ed25519 root@164.90.143.165
```

Ya en el **servidor**:

```bash
apt update && apt upgrade -y
adduser --disabled-password --gecos "" despliegue
mkdir -p /home/despliegue/.ssh
cp /root/.ssh/authorized_keys /home/despliegue/.ssh/
chown -R despliegue:despliegue /home/despliegue/.ssh
chmod 700 /home/despliegue/.ssh && chmod 600 /home/despliegue/.ssh/authorized_keys
```

## 5. Cortafuegos del servidor con ufw (servidor)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
ufw status
```

Docker no se salta ufw en los puertos que no publica, y el compose de producción solo publica 80 y 443
(en Caddy). La base de datos, Redis, PgBouncer y la API nunca quedan expuestos.

## 6. Instalar Docker (servidor)

```bash
curl -fsSL https://get.docker.com -o instalar-docker.sh
sh instalar-docker.sh
usermod -aG docker despliegue
docker --version && docker compose version
```

Desde ahora, entre siempre como `despliegue`. Hágalo desde **PowerShell**:

```powershell
ssh -i $env:USERPROFILE\.ssh\licencias_ed25519 despliegue@164.90.143.165
```

## 7. Carpeta y archivo `.env` (servidor, como `despliegue`)

```bash
mkdir -p ~/licencias && cd ~/licencias
umask 077
cat > .env <<EOF
DOMINIO=164-90-143-165.sslip.io
IMAGEN_API=ghcr.io/<usuario-de-github>/licencias-huanta-api
IMAGEN_PORTAL=ghcr.io/<usuario-de-github>/licencias-huanta-portal
VERSION=latest
POSTGRES_USER=licencias
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=')
POSTGRES_DB=licencias
JWT_SECRETO=$(openssl rand -base64 48)
CLAVE_CIFRADO_DATOS=$(openssl rand -base64 32)
CLAVE_HMAC_DATOS=$(openssl rand -base64 32)
EOF
chmod 600 .env
```

- `DOMINIO` es la IP con guiones más `.sslip.io`.
- `<usuario-de-github>` es el dueño del repositorio, en minúsculas.
- Los secretos se generan **en el servidor** y nadie más los ve. Guarde una copia de `.env` en un lugar
  seguro: si se pierden las claves de datos, los datos cifrados no se pueden leer.

## 8. Secretos en GitHub

En el repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor | Cómo obtenerlo |
| --- | --- | --- |
| `SERVIDOR_IP` | `164.90.143.165` | La IP del droplet |
| `SERVIDOR_USUARIO` | `despliegue` | — |
| `SSH_LLAVE` | Contenido de la llave **privada** | PowerShell: `Get-Content $env:USERPROFILE\.ssh\licencias_ed25519 -Raw` |
| `SSH_HUELLA_SERVIDOR` | Línea de `known_hosts` del servidor | PowerShell: `ssh-keyscan -t ed25519 164.90.143.165` |

Además:

- En **Settings → Environments → New environment**, cree `produccion`. Si quiere aprobar cada
  despliegue a mano, active *Required reviewers*.
- Los paquetes de GHCR quedan privados. El flujo de despliegue entra al registro con un permiso
  temporal que caduca al terminar.

## 9. Primer despliegue

Fusione cualquier cambio en `main`, o en **Actions → CD → Run workflow** elija `main`. El flujo:

1. espera a que el CI de `main` esté en verde;
2. construye las imágenes de la API y del portal y las publica en GHCR;
3. copia `infra/produccion/` al servidor;
4. ejecuta `./desplegar.sh sha-<commit>`: aplica las migraciones, actualiza una réplica a la vez y
   prueba `https://<dominio>/api/v1/salud`. Si falla, vuelve a la versión anterior.

Compruebe en el navegador que `https://164-90-143-165.sslip.io` abre con candado.

La primera vez, Caddy pide el certificado a Let's Encrypt; puede tardar hasta un minuto. Si no lo
obtiene, revise los registros:

```bash
cd ~/licencias && docker compose logs caddy --tail 50
```

## 10. Primer administrador y datos de demostración (servidor)

```bash
cd ~/licencias
docker compose exec api-a npm run crear-administrador
docker compose exec api-a node dist/scripts/sembrar-demostracion.js
```

El segundo comando muestra **una sola vez** la clave de cada usuario de demostración. Anótelas en un
lugar seguro: no quedan en ningún archivo. Si ejecuta el comando de nuevo, no se duplica nada; con
`--regenerar` se ponen claves nuevas.

## 11. Respaldo diario (servidor)

```bash
crontab -e
# agregue la línea:
0 3 * * * cd /home/despliegue/licencias && ./respaldo.sh >> /home/despliegue/respaldo.log 2>&1
```

Cómo bajar una copia a su computadora cada semana y cómo restaurarla:
[respaldo-restauracion.md](respaldo-restauracion.md).

## 12. Comprobar que solo están abiertos los puertos web

Desde su computadora (Git Bash):

```bash
sh infra/produccion/verificar-puertos.sh 164.90.143.165
```

Deben responder 22, 80 y 443. Los puertos 3000, 5432, 6379 y 6432 deben salir "cerrado". Copie la
salida en [resultados.md](resultados.md).

## 13. Vigilar la memoria (servidor)

```bash
docker stats --no-stream
free -h
```

Cada contenedor tiene un límite (Caddy 128 MB, cada API 384 MB, PgBouncer 32 MB, PostgreSQL 512 MB,
Redis 96 MB). Si `free -h` muestra menos de 100 MB libres de forma sostenida, conviene pasar a un
droplet de 4 GB. Basta con cambiar el tamaño en DigitalOcean; la configuración no cambia.

## Regla para los cambios en la base de datos: agregar antes de quitar

La vuelta atrás del despliegue solo cambia las imágenes. Las migraciones ya aplicadas se quedan. Por
eso cada migración debe funcionar también con la versión anterior del servicio:

- **Se puede, en un solo paso**: agregar tablas, columnas que admiten vacío o tienen valor por
  defecto, e índices.
- **En dos despliegues** (primero el código deja de usarlo, después la migración lo borra): borrar o
  renombrar tablas o columnas, o cambiar su tipo.

`infra/produccion/revisar-migraciones.sh` avisa en el PR si una migración nueva borra o renombra algo
sin el comentario `-- compatible: <motivo>`.
