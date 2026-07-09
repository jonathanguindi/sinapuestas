#!/usr/bin/env python3
"""
Genera SinApuestas.mobileconfig: un perfil de configuracion de iOS/iPadOS que
activa el filtro de contenido web INTEGRADO de Apple (sin VPN, sin app) y pone
en lista negra los dominios de apuestas. Al instalarlo, Safari y las apps que
usan WebKit no pueden abrir esos sitios.

Uso:  python3 make_profile.py   ->  escribe SinApuestas.mobileconfig
Lee los dominios de ../blocklists/domains.txt (o domains.txt local).
"""

import os
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))


def load_domains() -> list[str]:
    for path in (os.path.join(HERE, "..", "blocklists", "domains.txt"),
                 os.path.join(HERE, "domains.txt")):
        if os.path.exists(path):
            out = []
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.split("#", 1)[0].strip().lower().rstrip(".")
                    if line:
                        out.append(line)
            return out
    return []


def blacklist_xml(domains: list[str]) -> str:
    # BlacklistedURLs es un arreglo de CADENAS (URLs), no de diccionarios.
    # iOS rechaza el perfil ("The field BlacklistedURLs is invalid") si se
    # usan <dict><key>URL</key>...</dict> aquí.
    items = []
    for d in domains:
        items.append(f"                <string>https://{d}</string>")
        items.append(f"                <string>https://www.{d}</string>")
    return "\n".join(items)


def build(domains: list[str]) -> str:
    payload_uuid = str(uuid.uuid4()).upper()
    top_uuid = str(uuid.uuid4()).upper()
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key><string>com.apple.webcontent-filter</string>
            <key>PayloadVersion</key><integer>1</integer>
            <key>PayloadIdentifier</key><string>com.sinapuestas.webfilter</string>
            <key>PayloadUUID</key><string>{payload_uuid}</string>
            <key>PayloadDisplayName</key><string>Filtro de apuestas</string>
            <key>FilterType</key><string>BuiltIn</string>
            <key>AutoFilterEnabled</key><true/>
            <key>BlacklistedURLs</key>
            <array>
{blacklist_xml(domains)}
            </array>
        </dict>
    </array>
    <key>PayloadDisplayName</key><string>SinApuestas - Bloqueo de apuestas</string>
    <key>PayloadDescription</key><string>Bloquea los sitios de apuestas en Safari sin usar VPN. Para maxima proteccion, instalalo en un dispositivo supervisado o con un codigo de Tiempo en Pantalla que guarde otra persona.</string>
    <key>PayloadIdentifier</key><string>com.sinapuestas.profile</string>
    <key>PayloadType</key><string>Configuration</string>
    <key>PayloadUUID</key><string>{top_uuid}</string>
    <key>PayloadVersion</key><integer>1</integer>
    <key>PayloadRemovalDisallowed</key><true/>
</dict>
</plist>
"""


if __name__ == "__main__":
    doms = load_domains()
    out_path = os.path.join(HERE, "SinApuestas.mobileconfig")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(build(doms))
    print(f"✓ Perfil generado con {len(doms)} dominios: {out_path}")
