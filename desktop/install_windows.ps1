# Instala SinApuestas como tarea programada (SYSTEM) en Windows.
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

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) { Write-Host "No se encontro Python. Instalalo desde python.org." -ForegroundColor Red; exit 1 }

Write-Host "== Configurando SinApuestas =="
& $py "$dir\blocker.py" setup

# Tarea que ejecuta el vigilante como SYSTEM al arrancar (y lo reinicia)
$action  = New-ScheduledTaskAction -Execute $py -Argument "`"$dir\blocker.py`" run"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "SinApuestas" -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null

Start-ScheduledTask -TaskName "SinApuestas"
Write-Host ""
Write-Host "OK Servicio instalado y activo." -ForegroundColor Green
Write-Host "Estado:  python `"$dir\blocker.py`" status"
Write-Host "Desactivar (tras el compromiso):  python `"$dir\blocker.py`" stop"
Write-Host "y luego:  Unregister-ScheduledTask -TaskName SinApuestas -Confirm:`$false"
