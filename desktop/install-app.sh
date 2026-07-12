#!/bin/bash
# Instalador privilegiado que ejecuta la app SinApuestas.app con permisos de
# administrador (vía el cuadro nativo de macOS). No se usa desde la Terminal.
#
#   install-app.sh <carpeta_recursos> <archivo_contraseña> <días>
#
# Copia el bloqueador y las listas a una carpeta solo-administrador, guarda la
# contraseña (como hash con sal), aplica el bloqueo y registra el vigilante como
# demonio launchd. La contraseña llega en un archivo (nunca como argumento, para
# que no aparezca en la lista de procesos).
set -eu

RES="$1"; PWFILE="$2"; DAYS="$3"
APP="/Library/Application Support/SinApuestas"
LABEL="com.sinapuestas.blocker"
PLIST="/Library/LaunchDaemons/$LABEL.plist"

case "$DAYS" in ''|*[!0-9]*) DAYS=30 ;; esac

# Carpeta protegida, limpia.
rm -rf "$APP"
mkdir -p "$APP"
cp "$RES/blocker.sh" "$APP/"
cp "$RES/domains.txt" "$APP/"
[ -f "$RES/extra_domains.txt" ] && cp "$RES/extra_domains.txt" "$APP/"
chown -R root:wheel "$APP"
chmod 755 "$APP" "$APP/blocker.sh"
chmod 644 "$APP/domains.txt"
[ -f "$APP/extra_domains.txt" ] && chmod 644 "$APP/extra_domains.txt"

# Contraseña: sal aleatoria + hash. El texto plano llega por stdin (no en args).
SALT="$(openssl rand -hex 16)"
HASH="$( { printf '%s' "$SALT"; cat "$PWFILE"; } | shasum -a 256 | awk '{print $1}' )"
rm -f "$PWFILE"

NOW="$(date +%s)"
LOCK=$(( NOW + DAYS * 86400 ))

# Estado no secreto (legible: permite ver el estado sin pedir contraseña).
cat > "$APP/state" <<EOF
PROTECTION_ON=1
LOCK_UNTIL=$LOCK
EOF
chmod 644 "$APP/state"

# Secreto (solo root): sal y hash de la contraseña.
cat > "$APP/secret" <<EOF
SALT=$SALT
HASH=$HASH
EOF
chmod 600 "$APP/secret"
chown root:wheel "$APP/state" "$APP/secret"

# Aplicar el bloqueo ya mismo.
/bin/bash "$APP/blocker.sh" apply || true

# Demonio launchd: arranca con el sistema, se reinicia solo, corre como root.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$APP/blocker.sh</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
EOF
chown root:wheel "$PLIST"
chmod 644 "$PLIST"

launchctl bootout "system/$LABEL" 2>/dev/null || true
launchctl bootstrap system "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

echo "OK"
