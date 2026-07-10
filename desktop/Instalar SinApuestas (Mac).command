#!/usr/bin/env bash
# Instalador de doble clic para macOS. Abre una ventana de Terminal y corre
# el instalador real (install_macos.sh) con sudo.
#
# Si macOS no lo deja abrir con doble clic ("desarrollador no identificado"),
# haz clic derecho sobre el archivo → Abrir → Abrir.
cd "$(dirname "$0")"
clear
echo "======================================"
echo "   SinApuestas — Instalador para Mac"
echo "======================================"
echo
echo "Se te pedirá la contraseña de TU MAC para poder instalar."
echo "(No se ve mientras la escribes: es normal. Escribe y presiona Enter.)"
echo
sudo bash "./install_macos.sh" || {
  echo
  echo "✗ La instalación no terminó. Revisa el mensaje de arriba."
}
echo
read -r -p "Presiona Enter para cerrar esta ventana."
