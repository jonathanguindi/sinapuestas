# SinApuestas 🛡️

**Idiomas:** Español · [English](README.en.md) · [Português](README.pt.md)

Herramienta de apoyo para **dejar de apostar**: bloquea las apps y los sitios
web de apuestas en tu **celular (Android y iPhone)** y en tu **computadora**.
Sin VPN. Pensada para ser **lo más difícil posible de desbloquear** en un
impulso, con una contraseña o código que idealmente guarda otra persona de
confianza y un "período de compromiso" que no se puede acortar.

> Esto es una herramienta de apoyo, no un tratamiento. Si las apuestas te están
> haciendo daño, combínalo con ayuda real (ver el final).

## Qué hay en este repositorio

| Carpeta | Para qué | Cómo bloquea |
|---|---|---|
| `android/` | App Android (Kotlin) | Servicio de **Accesibilidad** + **Administrador de dispositivo**. Bloquea apps y webs de apuestas y se defiende de que la desinstalen. |
| `apple/` | iPhone / iPad | Perfil de configuración con filtro web + app nativa con **Screen Time / Family Controls** de Apple. |
| `desktop/` | Windows / macOS / Linux (Python) | Archivo **hosts** del sistema + un vigilante que lo repara. |
| `blocklists/` | Listas maestras | Dominios, paquetes y palabras clave de apuestas, editables. |
| `web/` | Página web | `index.html` para compartir el proyecto (ES/EN/PT). Se puede hospedar gratis en GitHub Pages. |
| `docs/` | Documentos | Textos listos para publicar en Google Play y App Store. |

## Cómo funciona el "candado" (en las tres plataformas)

1. Pones una **contraseña / código** — lo ideal es que lo escriba **otra
   persona** y no te lo diga.
2. Eliges un **período de compromiso** (7, 30, 90 días o un año).
3. Durante ese período **no se puede desactivar** el bloqueo, ni siquiera con la
   contraseña. Después, hace falta la contraseña para quitarlo.

## Empezar

- **Android:** abre `android/` en Android Studio, instala la app, pon la
  contraseña, elige los días y aprueba los 2 permisos que te pide. Detalles en
  el código y en este README. (minSdk 26 / Android 8+.)
- **iPhone:** sigue `apple/README.md` — la vía recomendada no requiere programar.
- **Computadora:** entra a `desktop/`, sigue `desktop/README.md` (un comando por
  sistema operativo).

## Honestidad sobre los límites

Ninguna herramienta sin rootear/jailbreak es 100% imposible de quitar para
alguien con permisos de administrador y tiempo. Lo que estas herramientas logran
es poner **suficiente fricción** para frenar el impulso, sobre todo si:

- la contraseña/código la tiene **otra persona**,
- usas un **período de compromiso largo**,
- en la computadora usas una cuenta **sin permisos de administrador**.

Ninguna app puede **cerrar tus cuentas** en una casa de apuestas: eso se hace
con la **autoexclusión**, que se pide directamente al operador o al regulador.

## Si las apuestas te están haciendo daño

- **Autoexclusión** en cada casa de apuestas donde tengas cuenta (pide también
  el cierre de la cuenta).
- **Bloqueo de pagos** al rubro de juego (código de comercio MCC 7995): muchos
  bancos lo permiten — pregunta en el tuyo.
- **Jugadores Anónimos** tiene grupos en toda América Latina:
  jugadoresanonimos.org

## Licencia

MIT — úsala, cámbiala y compártela libremente. Ojalá ayude a alguien. 💙
