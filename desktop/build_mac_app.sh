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

/usr/libexec/PlistBuddy -c "Set :CFBundleName SinApuestas" "$OUT/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 10.13" "$OUT/Contents/Info.plist" 2>/dev/null || true

echo "Construida: $OUT"
