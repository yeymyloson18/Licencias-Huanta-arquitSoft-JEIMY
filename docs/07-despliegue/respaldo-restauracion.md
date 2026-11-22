# Respaldo y restauración

## Qué se respalda y cuándo

Todos los días a las 03:00 corre `respaldo.sh` (cron del usuario `despliegue`, paso 11 de la
[guía](guia-vps.md)). Deja dos archivos en `/home/despliegue/respaldos/`:

| Archivo | Contenido |
| --- | --- |
| `licencias-AAAAMMDD-HHMM.dump` | La base de datos completa (`pg_dump`, formato comprimido) |
| `documentos-AAAAMMDD-HHMM.tar.gz` | Los documentos adjuntos de los expedientes (volumen `archivos-tramites`) |

Además:

- La carpeta tiene permisos `700` y los archivos `600`: solo el usuario `despliegue` los lee.
- Se conservan **7 días**.
- Cada archivo se escribe primero como `.parcial` y se renombra al terminar. Las copias viejas se borran
  **solo después** de un respaldo completo, así que si un día falla (disco lleno o base caída) quedan
  las de los días anteriores.
- El resultado de cada noche queda en `/home/despliegue/respaldo.log`.

## Bajar una copia a su computadora (cada semana, PowerShell)

Las copias viven en el mismo servidor. Si el servidor se pierde, también se pierden las copias. Por
eso, una vez por semana, baje la más reciente:

```powershell
$ip = "164.90.143.165"
$llave = "$env:USERPROFILE\.ssh\licencias_ed25519"
New-Item -ItemType Directory -Force "$env:USERPROFILE\Documentos\respaldos-licencias" | Out-Null
scp -i $llave "despliegue@${ip}:respaldos/licencias-*.dump" "$env:USERPROFILE\Documentos\respaldos-licencias\"
scp -i $llave "despliegue@${ip}:respaldos/documentos-*.tar.gz" "$env:USERPROFILE\Documentos\respaldos-licencias\"
```

Guarde también una copia del archivo `.env` del servidor en un lugar seguro. Sin
`CLAVE_CIFRADO_DATOS` ni `CLAVE_HMAC_DATOS`, los datos personales cifrados de una copia no se pueden
leer.

El siguiente paso es copiar automáticamente a un almacenamiento externo (por ejemplo, DigitalOcean
Spaces), que tiene costo.

## Probar una copia sin tocar el sistema (servidor)

```bash
cd ~/licencias
./restaurar.sh ~/respaldos/licencias-20261120-0300.dump
```

El script restaura la copia en una base **aparte** (`licencias_restaurada`) y compara los conteos con
la base viva:

```text
tabla                        viva  restaurada   ok
expedientes                    12          12   si
pagos registrados               7           7   si
licencias                       5           5   si
auditoría de trámites          41          41   si
auditoría de pagos              9           9   si
historial de estados           58          58   si
```

Si hubo movimiento después del respaldo, la base viva tendrá más filas. Lo importante es que la copia
tenga todo lo que había a la hora del respaldo, sin errores. Al terminar, el script borra la base
aparte. Esta prueba se hizo en local con `verificar-local.sh`; el resultado está en
[resultados.md](resultados.md).

## Restaurar de verdad (servidor)

Solo si la base se dañó o se perdió:

```bash
cd ~/licencias
docker compose stop api-a api-b            # nadie escribe mientras se restaura
./restaurar.sh ~/respaldos/licencias-20261120-0300.dump --reemplazar \
  --documentos ~/respaldos/documentos-20261120-0300.tar.gz
# escriba RESTAURAR cuando lo pida
docker compose up -d api-a api-b
```

Se pierde lo registrado entre la hora del respaldo y la falla. Por eso conviene anotar a mano los
pagos de ese día hasta que exista la réplica en tiempo real (ADR-008, siguiente paso).
