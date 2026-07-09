#!/usr/bin/env bash
# Instala SinApuestas como demonio launchd en macOS.
# Uso:  sudo bash install_macos.sh
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Ejecuta con sudo: sudo bash install_macos.sh"
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3)"
PLIST="/Library/LaunchDaemons/com.sinapuestas.blocker.plist"

echo "== Configurando SinApuestas =="
"$PY" "$DIR/blocker.py" setup

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.sinapuestas.blocker</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PY</string>
        <string>$DIR/blocker.py</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
EOF

chown root:wheel "$PLIST"
chmod 644 "$PLIST"
launchctl load -w "$PLIST"
echo
echo "✓ Demonio instalado y activo. Estado:  python3 $DIR/blocker.py status"
echo "Para desactivar (tras el compromiso):  sudo python3 $DIR/blocker.py stop"
echo "y luego:  sudo launchctl unload -w $PLIST"
