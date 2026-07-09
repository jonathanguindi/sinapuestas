#!/usr/bin/env python3
"""
SinApuestas — bloqueador de apuestas para computadora (Windows, macOS, Linux).

NO usa VPN. Bloquea los sitios de apuestas escribiendo en el archivo "hosts"
del sistema, que apunta esos dominios a 0.0.0.0 (a ninguna parte). Corre como
servicio y un "vigilante" reescribe el archivo si alguien intenta borrarlo, así
que es difícil de saltar. Para desactivarlo hace falta la contraseña de
custodio y que haya terminado el período de compromiso.

Uso:
    sudo python3 blocker.py setup      # configura contraseña + días y activa
    sudo python3 blocker.py run        # vigilante (lo lanza el servicio)
    python3 blocker.py status          # muestra estado
    sudo python3 blocker.py stop       # desactiva (pide contraseña; respeta compromiso)
    sudo python3 blocker.py apply      # reaplica el bloqueo una vez

Los instaladores (install_windows.ps1 / install_macos.sh / install_linux.sh)
registran "run" como servicio para que arranque con el sistema y no se pueda
cerrar sin permisos de administrador.
"""

import getpass
import hashlib
import json
import os
import secrets
import sys
import time

MARK_START = "# >>> SinApuestas bloqueo (no editar) >>>"
MARK_END = "# <<< SinApuestas bloqueo <<<"
CHECK_INTERVAL = 3  # segundos entre revisiones del vigilante


# --------------------------------------------------------------------------- #
# Rutas según el sistema operativo
# --------------------------------------------------------------------------- #
def hosts_path() -> str:
    if os.name == "nt":
        return os.path.join(
            os.environ.get("SystemRoot", r"C:\Windows"),
            "System32", "drivers", "etc", "hosts",
        )
    return "/etc/hosts"


def config_path() -> str:
    """Config protegida (solo administrador debería poder escribirla)."""
    if os.name == "nt":
        base = os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "SinApuestas")
    else:
        base = "/etc/sinapuestas"
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "config.json")


def domains_file() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "domains.txt")


# --------------------------------------------------------------------------- #
# Config: contraseña (hash + sal) y fin del compromiso
# --------------------------------------------------------------------------- #
def load_config() -> dict:
    try:
        with open(config_path(), encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_config(cfg: dict) -> None:
    with open(config_path(), "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)
    if os.name != "nt":
        os.chmod(config_path(), 0o600)


def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def check_password(cfg: dict, password: str) -> bool:
    if "hash" not in cfg or "salt" not in cfg:
        return False
    return hash_password(password, cfg["salt"]) == cfg["hash"]


def commitment_active(cfg: dict) -> bool:
    return cfg.get("protection_on", False) and time.time() < cfg.get("lock_until", 0)


def remaining_days(cfg: dict) -> int:
    rem = cfg.get("lock_until", 0) - time.time()
    return max(0, int((rem + 86399) // 86400))


# --------------------------------------------------------------------------- #
# Listas de dominios
# --------------------------------------------------------------------------- #
def load_domains() -> list[str]:
    """Carga domains.txt y, si existe, extra_domains.txt (listas mundiales
    descargadas con update_worldwide.py)."""
    here = os.path.dirname(os.path.abspath(__file__))
    files = [domains_file(), os.path.join(here, "extra_domains.txt")]
    seen = set()
    for path in files:
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.split("#", 1)[0].strip().lower().rstrip(".")
                    if line:
                        seen.add(line)
        except FileNotFoundError:
            pass
    return sorted(seen)


def block_lines() -> str:
    # 0.0.0.0 bloquea IPv4 y "::" bloquea IPv6 — sin la linea IPv6, dominios
    # con direccion AAAA (p. ej. caliente.mx) seguirian siendo accesibles.
    lines = [MARK_START]
    for d in load_domains():
        for name in (d, f"www.{d}"):
            lines.append(f"0.0.0.0 {name}")
            lines.append(f":: {name}")
    lines.append(MARK_END)
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------- #
# Escritura del archivo hosts
# --------------------------------------------------------------------------- #
def read_hosts() -> str:
    try:
        with open(hosts_path(), encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except FileNotFoundError:
        return ""


def strip_block(content: str) -> str:
    if MARK_START not in content:
        return content
    before = content.split(MARK_START, 1)[0]
    after = content.split(MARK_END, 1)[1] if MARK_END in content else ""
    return before.rstrip() + ("\n" if before.strip() else "") + after.lstrip()


def apply_block() -> bool:
    """Asegura que el bloque de bloqueo esté presente y correcto. True si escribió."""
    current = read_hosts()
    desired_block = block_lines()
    base = strip_block(current).rstrip()
    new_content = (base + "\n\n" if base else "") + desired_block

    # Solo reescribe si cambió, para no desgastar el disco.
    if current == new_content:
        return False
    try:
        with open(hosts_path(), "w", encoding="utf-8") as fh:
            fh.write(new_content)
        flush_dns()
        return True
    except PermissionError:
        print("ERROR: se necesitan permisos de administrador para escribir hosts.")
        sys.exit(1)


def remove_block() -> None:
    content = read_hosts()
    cleaned = strip_block(content)
    with open(hosts_path(), "w", encoding="utf-8") as fh:
        fh.write(cleaned)
    flush_dns()


def flush_dns() -> None:
    try:
        if os.name == "nt":
            os.system("ipconfig /flushdns >NUL 2>&1")
        elif sys.platform == "darwin":
            os.system("dscacheutil -flushcache >/dev/null 2>&1; "
                      "killall -HUP mDNSResponder >/dev/null 2>&1")
        else:
            os.system("systemd-resolve --flush-caches >/dev/null 2>&1 || true")
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# Comandos
# --------------------------------------------------------------------------- #
def cmd_setup() -> None:
    cfg = load_config()
    if cfg.get("protection_on"):
        print("La protección ya está activa. Usa 'status' o 'stop'.")
        return
    print("== Configurar SinApuestas ==")
    print("Idealmente, que otra persona de confianza escriba la contraseña,")
    print("para que no puedas quitar el bloqueo en un impulso.\n")
    p1 = getpass.getpass("Contraseña de custodio: ")
    p2 = getpass.getpass("Repite la contraseña: ")
    if len(p1) < 4 or p1 != p2:
        print("Contraseña inválida o no coincide.")
        return
    try:
        days = int(input("Días de compromiso (ej. 30): ").strip() or "30")
    except ValueError:
        days = 30
    salt = secrets.token_hex(16)
    save_config({
        "salt": salt,
        "hash": hash_password(p1, salt),
        "protection_on": True,
        "lock_until": time.time() + days * 86400,
    })
    apply_block()
    print(f"\n✓ Protección activa. Compromiso de {days} días.")
    print("Ahora instala el servicio con el script de tu sistema para que")
    print("el bloqueo se mantenga y arranque solo (ver README).")


def cmd_run() -> None:
    """Vigilante: mantiene el bloqueo y repara el archivo si lo tocan."""
    while True:
        cfg = load_config()
        if cfg.get("protection_on"):
            apply_block()
        time.sleep(CHECK_INTERVAL)


def cmd_apply() -> None:
    cfg = load_config()
    if not cfg.get("protection_on"):
        print("La protección está desactivada.")
        return
    changed = apply_block()
    print("Bloqueo reaplicado." if changed else "El bloqueo ya estaba puesto.")


def cmd_status() -> None:
    cfg = load_config()
    if not cfg.get("protection_on"):
        print("Estado: DESACTIVADO")
        return
    present = MARK_START in read_hosts()
    d = remaining_days(cfg)
    print("Estado: ACTIVO 🛡️" + (" (bloqueo aplicado)" if present else " (¡reaplicando!)"))
    print(f"Dominios bloqueados: {len(load_domains())}")
    if commitment_active(cfg):
        print(f"Compromiso: faltan {d} días (no se puede desactivar antes).")
    else:
        print("Compromiso: cumplido. Se puede desactivar con la contraseña.")


def cmd_stop() -> None:
    cfg = load_config()
    if not cfg.get("protection_on"):
        print("Ya está desactivado.")
        return
    pwd = getpass.getpass("Contraseña de custodio: ")
    if not check_password(cfg, pwd):
        print("Contraseña incorrecta.")
        return
    if commitment_active(cfg):
        print(f"Aún faltan {remaining_days(cfg)} días de tu compromiso. Ánimo, vas bien. 💪")
        return
    cfg["protection_on"] = False
    save_config(cfg)
    remove_block()
    print("Protección desactivada. Recuerda detener/desinstalar el servicio (ver README).")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    handlers = {
        "setup": cmd_setup, "run": cmd_run, "apply": cmd_apply,
        "status": cmd_status, "stop": cmd_stop,
    }
    handler = handlers.get(cmd)
    if not handler:
        print(__doc__)
        return
    handler()


if __name__ == "__main__":
    main()
