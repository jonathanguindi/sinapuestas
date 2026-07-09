#!/usr/bin/env bash
# Instala SinApuestas como servicio systemd en Linux.
# Uso:  sudo bash install_linux.sh
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Ejecuta con sudo: sudo bash install_linux.sh"
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3)"

echo "== Configurando SinApuestas =="
"$PY" "$DIR/blocker.py" setup

cat > /etc/systemd/system/sinapuestas.service <<EOF
[Unit]
Description=SinApuestas - vigilante de bloqueo de apuestas
After=network.target

[Service]
Type=simple
ExecStart=$PY $DIR/blocker.py run
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sinapuestas.service
echo
echo "✓ Servicio instalado y activo. Estado:  python3 $DIR/blocker.py status"
echo "Para desactivar (tras el compromiso):  sudo python3 $DIR/blocker.py stop"
echo "y luego:  sudo systemctl disable --now sinapuestas.service"
