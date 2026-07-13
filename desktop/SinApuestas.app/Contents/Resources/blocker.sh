#!/bin/bash
# SinApuestas — motor del bloqueador para macOS/Linux (bash puro, sin Python).
#
# Bloquea los sitios de apuestas escribiendo en el archivo "hosts" del sistema
# (los dominios se mandan a 0.0.0.0 / ::, o sea a ninguna parte). Corre como
# servicio y un vigilante reescribe el bloqueo si alguien lo borra. Para
# desactivarlo hace falta la contraseña de custodio Y que haya terminado el
# período de compromiso.
#
# Uso:
#   blocker.sh apply             reaplica el bloqueo una vez (root)
#   blocker.sh run               vigilante en bucle (lo lanza el servicio, root)
#   blocker.sh status            muestra el estado (sin root)
#   blocker.sh stop <pwfile>     desactiva si la contraseña de <pwfile> es
#                                correcta y el compromiso ya terminó (root)
set -u

APP="${SA_APP:-/Library/Application Support/SinApuestas}"
HOSTS="${SA_HOSTS:-/etc/hosts}"
MARK_START="# >>> SinApuestas bloqueo (no editar) >>>"
MARK_END="# <<< SinApuestas bloqueo <<<"
CHECK_INTERVAL=3

now() { date +%s; }

load_domains() {
  cat "$APP/domains.txt" "$APP/extra_domains.txt" 2>/dev/null \
    | sed 's/#.*//' \
    | tr 'A-Z' 'a-z' \
    | tr -d '[:blank:]' \
    | sed 's/\.$//' \
    | grep -v '^$' \
    | sort -u
}

flush_dns() {
  if [ "$(uname)" = "Darwin" ]; then
    dscacheutil -flushcache >/dev/null 2>&1
    killall -HUP mDNSResponder >/dev/null 2>&1
  else
    systemd-resolve --flush-caches >/dev/null 2>&1 || \
      resolvectl flush-caches >/dev/null 2>&1 || true
  fi
}

# Devuelve el contenido de hosts sin nuestro bloque y sin líneas en blanco
# finales. Portátil entre el awk de macOS (BSD) y el de Linux.
hosts_base() {
  awk -v s="$MARK_START" -v e="$MARK_END" '
    $0==s {skip=1; next}
    skip && $0==e {skip=0; next}
    !skip {print}
  ' "$HOSTS" 2>/dev/null \
  | awk 'NF{last=NR} {line[NR]=$0} END{for(i=1;i<=last;i++) print line[i]}'
}

# Escribe el bloque de bloqueo en hosts (idempotente). Devuelve 0 si cambió algo.
apply_block() {
  local tmp base
  base="$(hosts_base)"
  tmp="$(mktemp)"
  {
    [ -n "$base" ] && printf '%s\n\n' "$base"
    printf '%s\n' "$MARK_START"
    while IFS= read -r d; do
      [ -n "$d" ] || continue
      printf '0.0.0.0 %s\n:: %s\n0.0.0.0 www.%s\n:: www.%s\n' "$d" "$d" "$d" "$d"
    done < <(load_domains)
    printf '%s\n' "$MARK_END"
  } > "$tmp"

  if cmp -s "$tmp" "$HOSTS"; then
    rm -f "$tmp"
    return 1
  fi
  cat "$tmp" > "$HOSTS"
  rm -f "$tmp"
  flush_dns
  return 0
}

remove_block() {
  local base
  base="$(hosts_base)"
  printf '%s\n' "$base" > "$HOSTS"
  flush_dns
}

# Carga el estado no secreto (PROTECTION_ON, LOCK_UNTIL, MODE).
# MODE=custodio → se quita con contraseña al terminar el compromiso.
# MODE=aleatorio → código secreto que nadie tiene; se libera solo al terminar.
load_state() {
  PROTECTION_ON=0; LOCK_UNTIL=0; MODE=custodio
  [ -f "$APP/state" ] && . "$APP/state"
}

remaining_days() {
  local rem; rem=$(( LOCK_UNTIL - $(now) ))
  [ "$rem" -lt 0 ] && rem=0
  echo $(( (rem + 86399) / 86400 ))
}

commitment_active() {
  load_state
  [ "${PROTECTION_ON:-0}" = "1" ] && [ "$(now)" -lt "${LOCK_UNTIL:-0}" ]
}

cmd_apply() {
  load_state
  [ "${PROTECTION_ON:-0}" = "1" ] || { echo "Protección desactivada."; exit 0; }
  if apply_block; then echo "Bloqueo aplicado."; else echo "El bloqueo ya estaba puesto."; fi
}

cmd_run() {
  while true; do
    load_state
    [ "${PROTECTION_ON:-0}" = "1" ] && apply_block
    sleep "$CHECK_INTERVAL"
  done
}

cmd_status() {
  load_state
  if [ "${PROTECTION_ON:-0}" != "1" ]; then echo "Estado: DESACTIVADO"; exit 0; fi
  if grep -q "$MARK_START" "$HOSTS" 2>/dev/null; then
    echo "Estado: ACTIVO (bloqueo aplicado)"
  else
    echo "Estado: ACTIVO (reaplicando…)"
  fi
  echo "Dominios bloqueados: $(load_domains | wc -l | tr -d ' ')"
  echo "Modo: ${MODE:-custodio}"
  if commitment_active; then
    echo "Compromiso: faltan $(remaining_days) días (no se puede desactivar antes)."
  else
    echo "Compromiso: cumplido. Se puede desactivar."
  fi
}

disable_now() {
  {
    echo "PROTECTION_ON=0"
    echo "LOCK_UNTIL=$LOCK_UNTIL"
    echo "MODE=$MODE"
  } > "$APP/state"
  remove_block
  echo "DESACTIVADO"
}

cmd_stop() {
  local pwfile="${1:-}" try
  load_state
  [ "${PROTECTION_ON:-0}" = "1" ] || { echo "Ya está desactivado."; exit 0; }

  # Durante el compromiso NUNCA se puede quitar, en ningún modo.
  if commitment_active; then echo "COMPROMISO_ACTIVO:$(remaining_days)"; exit 3; fi

  # Modo código aleatorio: nadie tiene la clave. Cumplido el compromiso, se
  # libera solo (sin contraseña).
  if [ "${MODE:-custodio}" = "aleatorio" ]; then
    disable_now
    return
  fi

  # Modo custodio: exige la contraseña correcta.
  [ -f "$pwfile" ] || { echo "Falta la contraseña."; exit 1; }
  [ -f "$APP/secret" ] || { echo "No hay configuración."; exit 1; }
  . "$APP/secret"   # define SALT y HASH
  try="$( { printf '%s' "$SALT"; cat "$pwfile"; } | shasum -a 256 | awk '{print $1}' )"
  rm -f "$pwfile"
  if [ "$try" != "$HASH" ]; then echo "CONTRASEÑA_INCORRECTA"; exit 2; fi
  disable_now
}

case "${1:-status}" in
  apply)  cmd_apply ;;
  run)    cmd_run ;;
  status) cmd_status ;;
  stop)   cmd_stop "${2:-}" ;;
  *) echo "Comando no reconocido: ${1:-}"; exit 1 ;;
esac
