#!/bin/bash
# Construye SinApuestas.app a partir del AppleScript y mete los recursos.
# Requiere macOS (osacompile). Uso:  bash build_mac_app.sh
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/SinApuestas.app"

rm -rf "$OUT"
osacompile -o "$OUT" "$DIR/SinApuestas.applescript"

RES="$OUT/Contents/Resources"
cp "$DIR/blocker.sh" "$DIR/install-app.sh" "$DIR/domains.txt" "$RES/"
[ -f "$DIR/extra_domains.txt" ] && cp "$DIR/extra_domains.txt" "$RES/"
chmod +x "$RES/blocker.sh" "$RES/install-app.sh"

# Ícono de la marca (escudo de SinApuestas). Si no existe, lo genera.
if [ ! -f "$DIR/icon.icns" ]; then
  ICO="$(mktemp -d)/SinApuestas.iconset"; mkdir -p "$ICO"
  for spec in 16:icon_16x16 32:icon_16x16@2x 32:icon_32x32 64:icon_32x32@2x \
              128:icon_128x128 256:icon_128x128@2x 256:icon_256x256 \
              512:icon_256x256@2x 512:icon_512x512 1024:icon_512x512@2x; do
    swift "$DIR/makeicon.swift" "${spec%%:*}" "$ICO/${spec#*:}.png"
  done
  iconutil -c icns "$ICO" -o "$DIR/icon.icns"
fi
cp "$DIR/icon.icns" "$RES/applet.icns"

/usr/libexec/PlistBuddy -c "Set :CFBundleName SinApuestas" "$OUT/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile applet" "$OUT/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 10.13" "$OUT/Contents/Info.plist" 2>/dev/null || true
touch "$OUT"

echo "Construida: $OUT"
