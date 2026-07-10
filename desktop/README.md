# SinApuestas — Computadora (Windows / macOS / Linux)

Bloquea los sitios de apuestas en tu computadora **sin VPN**. Funciona
escribiendo en el archivo `hosts` del sistema (los dominios de apuestas se
mandan a "ninguna parte"), y un **vigilante** que corre como servicio repara el
archivo si alguien lo borra. Para desactivarlo hace falta la **contraseña de
custodio** y que haya terminado el **período de compromiso**.

## Requisitos
- Python 3.9 o más nuevo.
- Permisos de administrador (para escribir en `hosts` e instalar el servicio).

## Instalar

**Windows** — abre PowerShell **como administrador**:
```powershell
powershell -ExecutionPolicy Bypass -File install_windows.ps1
```

**macOS**:
```bash
sudo bash install_macos.sh
```

**Linux**:
```bash
sudo bash install_linux.sh
```

El instalador copia el bloqueador y las listas a una **carpeta protegida** que
solo un administrador puede modificar (macOS: `/Library/Application
Support/SinApuestas`, Linux: `/opt/sinapuestas`, Windows:
`C:\ProgramData\SinApuestas`), te pide una contraseña (idealmente la escribe
otra persona) y los días de compromiso, aplica el bloqueo y registra el
servicio desde esa carpeta para que arranque solo con el sistema. Después de
instalar puedes borrar la carpeta descargada: el servicio ya no depende de ella.

## Comandos útiles
Usa la ruta de la carpeta protegida de tu sistema, por ejemplo en macOS:
```bash
python3 "/Library/Application Support/SinApuestas/blocker.py" status   # ver estado
sudo python3 "/Library/Application Support/SinApuestas/blocker.py" stop   # desactivar (pide contraseña; respeta el compromiso)
```

## Cómo hacerlo lo más difícil de saltar
- Que **otra persona** ponga la contraseña y no te la diga hasta terminar el
  compromiso.
- Usa un período largo (30, 90 días o un año).
- Usa una cuenta de usuario **sin permisos de administrador** en tu día a día:
  así no puedes editar `hosts` ni parar el servicio tú mismo.
- En el navegador, desactiva el "DNS seguro / DNS-over-HTTPS" (en Chrome:
  Configuración → Privacidad → Usar DNS seguro → desactivar), porque puede
  saltarse el archivo `hosts`.

## Limitaciones honestas
- Con permisos de administrador, cualquiera puede parar el servicio y editar
  `hosts`. Por eso la contraseña de un tercero y una cuenta sin admin son clave.
- No bloquea apps de escritorio dedicadas que no usen estos dominios (la mayoría
  de casas de apuestas en compu se usan por navegador, así que quedan cubiertas).
- Bloquea por dominio: agrega los que falten en el `domains.txt` de la carpeta
  protegida (con sudo/administrador) y corre `sudo python3 blocker.py apply`.
