# SinApuestas — Computadora (Windows / macOS / Linux)

Bloquea los sitios de apuestas en tu computadora **sin VPN**. Funciona
escribiendo en el archivo `hosts` del sistema (los dominios de apuestas se
mandan a "ninguna parte"), y un **vigilante** que corre como servicio repara el
archivo si alguien lo borra. Para desactivarlo hace falta la **contraseña de
custodio** y que haya terminado el **período de compromiso**.

## Instalar

### macOS — con la app (sin Terminal)
Haz **doble clic en `SinApuestas.app`**. La app te muestra primero una pantalla
donde aceptas que, durante el tiempo elegido, será imposible quitarlo. Luego
eliges:

- **Código secreto automático (recomendado):** la app genera una clave al azar
  que **nadie verá** y la descarta. El candado no se puede abrir en un impulso;
  se libera **solo** cuando termina el tiempo que elegiste.
- **Que otra persona ponga la clave:** un tercero de confianza escribe una
  contraseña y podría abrirlo antes solo con ella (siempre respetando el
  período de compromiso).

Después eliges la duración (7, 30, 90 días o 1 año) y macOS te pide **una vez**
tu contraseña de administrador (el cuadro normal del sistema). Listo.

La primera vez, como la app no está firmada por Apple, macOS puede decir que
es de un "desarrollador no identificado": haz **clic derecho sobre
`SinApuestas.app` → Abrir → Abrir** (solo esa primera vez).

Para ver el estado o desactivar (cuando termine el compromiso), vuelve a abrir
la misma app.

### Windows — PowerShell como administrador
```powershell
powershell -ExecutionPolicy Bypass -File install_windows.ps1
```
Requiere Python (instálalo desde python.org marcando "Install for all users").

### Linux
```bash
sudo bash install_linux.sh
```
Requiere Python 3.

En los tres casos, el instalador copia el bloqueador y las listas a una
**carpeta protegida** que solo un administrador puede modificar (macOS:
`/Library/Application Support/SinApuestas`, Linux: `/opt/sinapuestas`, Windows:
`C:\ProgramData\SinApuestas`), guarda tu contraseña como hash con sal, aplica el
bloqueo y registra el servicio para que arranque solo con el sistema. Después
puedes borrar la carpeta descargada: el servicio ya no depende de ella.

## Cómo hacerlo lo más difícil de saltar
- Que **otra persona** ponga la contraseña de custodio y no te la diga hasta
  terminar el compromiso.
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
- El compromiso se mide con el reloj del sistema: adelantar mucho la fecha puede
  vencerlo antes.

## Para desarrolladores
- `blocker.sh` — motor del bloqueo en bash (macOS/Linux): `apply` / `run` /
  `status` / `stop`.
- `blocker.py` — equivalente en Python que usan los instaladores de Windows y
  Linux por scripts.
- `SinApuestas.applescript` + `install-app.sh` + `build_mac_app.sh` — fuente de
  la app de Mac. Reconstruir con `bash build_mac_app.sh` en una Mac.
