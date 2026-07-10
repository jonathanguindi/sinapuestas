# Instala SinApuestas como tarea programada (SYSTEM) en Windows.
#
# Copia el bloqueador y las listas a una carpeta protegida (ProgramData con
# permisos de solo lectura para usuarios) y registra la tarea desde ahi. Asi
# nadie puede vaciar la lista de dominios ni editar el codigo sin ser
# administrador.
#
# Uso: abre PowerShell COMO ADMINISTRADOR y ejecuta:
#   powershell -ExecutionPolicy Bypass -File install_windows.ps1

$ErrorActionPreference = "Stop"

# Verificar que corre como administrador
$admin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "Abre PowerShell COMO ADMINISTRADOR y vuelve a ejecutar." -ForegroundColor Red
    exit 1
}

$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $env:ProgramData "SinApuestas"

# Preferir el lanzador "py" (se instala en carpetas del sistema); si no,
# python del PATH. Ojo: un Python instalado "solo para mi usuario" vive en
# AppData y el usuario podria modificarlo; el instalador avisa en ese caso.
$py = (Get-Command py -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command python -ErrorAction SilentlyContinue).Source }
if (-not $py) { Write-Host "No se encontro Python. Instalalo desde python.org (marca 'para todos los usuarios')." -ForegroundColor Red; exit 1 }
if ($py -like "$env:LOCALAPPDATA*") {
    Write-Host "AVISO: tu Python esta instalado solo para tu usuario (AppData)." -ForegroundColor Yellow
    Write-Host "Para maxima proteccion, reinstala Python marcando 'Install for all users'." -ForegroundColor Yellow
}

Write-Host "== Copiando SinApuestas a la carpeta protegida =="
New-Item -ItemType Directory -Force -Path $app | Out-Null
foreach ($f in @("blocker.py", "domains.txt", "extra_domains.txt", "update_worldwide.py", "README.md")) {
    $p = Join-Path $src $f
    if (Test-Path $p) { Copy-Item $p $app -Force }
}
# Endurecer permisos: administradores y SYSTEM controlan; usuarios solo leen.
icacls $app /inheritance:r /grant "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" | Out-Null

Write-Host "== Configurando SinApuestas =="
& $py "$app\blocker.py" setup

# Tarea que ejecuta el vigilante como SYSTEM al arrancar (y lo reinicia)
$action  = New-ScheduledTaskAction -Execute $py -Argument "`"$app\blocker.py`" run"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "SinApuestas" -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null

Start-ScheduledTask -TaskName "SinApuestas"
Write-Host ""
Write-Host "OK Servicio instalado y activo." -ForegroundColor Green
Write-Host "Estado:  python `"$app\blocker.py`" status"
Write-Host "Desactivar (tras el compromiso):  python `"$app\blocker.py`" stop"
Write-Host "y luego:  Unregister-ScheduledTask -TaskName SinApuestas -Confirm:`$false"
