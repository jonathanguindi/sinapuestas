#!/usr/bin/env python3
"""
Descarga listas publicas GIGANTES de dominios de apuestas/casinos de todo el
mundo y las guarda en extra_domains.txt, que blocker.py fusiona automaticamente
con su propia lista. Asi el bloqueo cubre decenas de miles de casas de todo el
planeta, no solo las mas conocidas.

Uso:  python3 update_worldwide.py

Requiere conexion a internet. Vuelve a correrlo de vez en cuando para
actualizar (idealmente lo hace el mismo servicio una vez al dia).
"""

import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "extra_domains.txt")

# Listas publicas de la categoria "gambling" (mantenidas por la comunidad).
SOURCES = [
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/extensions/gambling/hosts",
    "https://blocklistproject.github.io/Lists/gambling.txt",
]

DOMAIN_RE = re.compile(r"^(?:0\.0\.0\.0|127\.0\.0\.1)?\s*([a-z0-9.-]+\.[a-z]{2,})\s*$")


def extract_domains(text: str) -> set[str]:
    out = set()
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip().lower()
        if not line or line.startswith(("!", ":")):
            continue
        m = DOMAIN_RE.match(line)
        if m:
            d = m.group(1).lstrip("|^").rstrip("^")
            if "." in d and d not in ("localhost", "local"):
                out.add(d)
    return out


def main() -> None:
    all_domains: set[str] = set()
    for url in SOURCES:
        try:
            print(f"Descargando {url} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "SinApuestas"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8", "replace")
            found = extract_domains(text)
            print(f"  -> {len(found)} dominios")
            all_domains |= found
        except Exception as e:  # noqa: BLE001
            print(f"  ! No se pudo descargar: {e}", file=sys.stderr)

    if not all_domains:
        print("No se obtuvo ninguna lista. Revisa tu conexion.")
        return

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("# Lista mundial descargada automaticamente. No editar a mano.\n")
        for d in sorted(all_domains):
            fh.write(d + "\n")
    print(f"\n✓ Guardados {len(all_domains)} dominios en {OUT}")
    print("El bloqueo los usara la proxima vez que el vigilante reaplique (unos segundos).")


if __name__ == "__main__":
    main()
