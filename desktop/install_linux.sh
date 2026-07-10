#!/usr/bin/env bash
# Instala SinApuestas como servicio systemd en Linux.
#
# Copia el bloqueador y las listas a una carpeta protegida (solo root) y
# registra el servicio desde ahí. Así nadie puede vaciar la lista de dominios
# ni editar el código sin sudo.
#
# Uso:  sudo bash install_linux.sh
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Ejecuta con sudo: sudo bash install_linux.sh"
  exit 1
fi

SRC="$(cd "$(dirname "$0")" && pwd)"
APP="/opt/sinapuestas"
PY="/usr/bin/python3"

if [ ! -x "$PY" ]; then
  echo "No se encontró $PY. Instala Python 3 con tu gestor de paquetes."
  exit 1
fi

echo "== Copiando SinApuestas a la carpeta protegida =="
mkdir -p "$APP"
for f in blocker.py domains.txt extra_domains.txt update_worldwide.py README.md; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$APP/"
done
chown -R root:root "$APP"
chmod 755 "$APP"
chmod 644 "$APP"/*

echo "== Configurando SinApuestas =="
"$PY" "$APP/blocker.py" setup

cat > /etc/systemd/system/sinapuestas.service <<EOF
[Unit]
Description=SinApuestas - vigilante de bloqueo de apuestas
After=network.target

[Service]
Type=simple
ExecStart=$PY $APP/blocker.py run
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sinapuestas.service
systemctl restart sinapuestas.service
echo
echo "✓ Servicio instalado y activo. Estado:  python3 $APP/blocker.py status"
echo "Para desactivar (tras el compromiso):  sudo python3 $APP/blocker.py stop"
echo "y luego:  sudo systemctl disable --now sinapuestas.service"
