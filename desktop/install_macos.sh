#!/usr/bin/env bash
# Instala SinApuestas como demonio launchd en macOS.
#
# Copia el bloqueador y las listas a una carpeta protegida (solo modificable
# como administrador) y registra el vigilante desde ahí. Así nadie puede vaciar
# la lista de dominios ni editar el código sin la contraseña del sistema.
#
# Uso:  sudo bash install_macos.sh
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Ejecuta con sudo: sudo bash install_macos.sh"
  exit 1
fi

SRC="$(cd "$(dirname "$0")" && pwd)"
APP="/Library/Application Support/SinApuestas"
PY="/usr/bin/python3"
LABEL="com.sinapuestas.blocker"
PLIST="/Library/LaunchDaemons/$LABEL.plist"

# Python del sistema (propiedad de root; no usar el de Homebrew, que el
# usuario puede editar). En una Mac limpia requiere las herramientas de
# línea de comandos.
if ! "$PY" -c '' >/dev/null 2>&1; then
  echo "Falta el Python del sistema. Ejecuta primero:  xcode-select --install"
  exit 1
fi

echo "== Copiando SinApuestas a la carpeta protegida =="
mkdir -p "$APP"
for f in blocker.py domains.txt extra_domains.txt update_worldwide.py README.md; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$APP/"
done
chown -R root:wheel "$APP"
chmod 755 "$APP"
chmod 644 "$APP"/*

echo "== Configurando SinApuestas =="
"$PY" "$APP/blocker.py" setup

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PY</string>
        <string>$APP/blocker.py</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
EOF

chown root:wheel "$PLIST"
chmod 644 "$PLIST"

# Recargar aunque ya estuviera instalado (permite re-ejecutar el instalador)
launchctl bootout "system/$LABEL" 2>/dev/null || true
launchctl bootstrap system "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

echo
echo "✓ Demonio instalado y activo. Estado:  python3 \"$APP/blocker.py\" status"
echo "Para desactivar (tras el compromiso):  sudo python3 \"$APP/blocker.py\" stop"
echo "y luego:  sudo launchctl bootout system/$LABEL && sudo rm \"$PLIST\""
