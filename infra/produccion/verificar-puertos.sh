#!/usr/bin/env sh
# Comprobación desde FUERA del servidor de que solo responden los puertos web y SSH (007, FR-020,
# SC-006). Ejecútelo en su computadora (Git Bash o WSL), no en el servidor:
#   ./verificar-puertos.sh 164.90.143.165
# Salida esperada: 22, 80 y 443 "abierto"; 3000, 5432, 6379 y 6432 "cerrado". Sale con 1 si alguno de
# los internos responde.
set -u

IP="${1:?Uso: ./verificar-puertos.sh <ip-del-servidor>}"
ESPERADOS_ABIERTOS="22 80 443"
INTERNOS="3000 5432 6379 6432"

probar() {
  # Intenta abrir una conexión TCP con un tiempo máximo de 3 s (sin enviar datos).
  if command -v nc > /dev/null 2>&1; then
    nc -z -w 3 "$IP" "$1" > /dev/null 2>&1
  else
    timeout 3 sh -c "exec 3<>/dev/tcp/$IP/$1" > /dev/null 2>&1
  fi
}

fallas=0
for puerto in $ESPERADOS_ABIERTOS $INTERNOS; do
  if probar "$puerto"; then estado=abierto; else estado=cerrado; fi
  printf 'puerto %-5s %s\n' "$puerto" "$estado"
  case " $INTERNOS " in
    *" $puerto "*) [ "$estado" = abierto ] && fallas=1 ;;
  esac
done

if [ "$fallas" -eq 0 ]; then
  echo 'OK: ningún puerto interno responde desde fuera.'
else
  echo 'ERROR: hay puertos internos expuestos; revise ufw, el cortafuegos de DigitalOcean y docker-compose.yml.'
fi
exit "$fallas"
