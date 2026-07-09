# SinApuestas — iPhone / iPad

La verdad primero, sin humo: en iPhone **ninguna app puede bloquear otras apps
"por su cuenta"** como en Android. Apple lo prohíbe por diseño. Las únicas vías
reales para bloquear apuestas **sin VPN** son tres, de la más fácil a la más
técnica. Puedes combinarlas.

---

## Opción A (recomendada, sin programar): Tiempo en Pantalla + perfil

La forma **más difícil de desbloquear** en un iPhone normal, sin depender de un
desarrollador:

1. **Instala el perfil de filtro web** `SinApuestas.mobileconfig` (en esta
   carpeta). Bloquea los sitios de apuestas en Safari en todo el sistema.
   - Pásalo al iPhone (AirDrop, correo o web) y ábrelo →
     Ajustes → General → VPN y gestión de dispositivos → Instalar.
   - Genera tu propia versión actualizada con:  `python3 make_profile.py`
2. **Bloquea con Tiempo en Pantalla y una clave de otra persona:**
   - Ajustes → Tiempo en Pantalla → actívalo y pon un **código de Tiempo en
     Pantalla**. Que lo escriba **una persona de confianza** y no te lo diga.
   - Tiempo en Pantalla → Restricciones de contenido y privacidad → Contenido
     web → **Limitar sitios para adultos** (así el perfil y esta restricción no
     se pueden cambiar sin el código).
   - Con ese código puesto por otra persona, tú no puedes quitar el perfil ni
     las restricciones en un impulso.

Para lo **máximo**: un iPhone **supervisado** (con Apple Configurator en una
Mac) permite instalar el perfil como **no eliminable**. Es el nivel más fuerte
posible sin jailbreak.

---

## Opción B (app nativa): carpeta `SinApuestasApp/`

App en SwiftUI que usa el framework oficial **Family Controls / ManagedSettings
(Screen Time)** para "escudar" (shield) las apps de apuestas que elijas y sus
sitios, con un candado de compromiso en días.

**Requisitos:**
- Una Mac con **Xcode**.
- El *entitlement* `com.apple.developer.family-controls` (archivo
  `SinApuestas.entitlements`). En **desarrollo** funciona firmando con tu Apple
  ID; para **publicar** en la App Store hay que solicitarlo a Apple:
  https://developer.apple.com/contact/request/family-controls-distribution

**Cómo abrirla:**
1. En Xcode: File → New → Project → App (SwiftUI), nómbralo `SinApuestas`.
2. Reemplaza los archivos generados por los de `SinApuestasApp/`.
3. En "Signing & Capabilities" añade la capacidad **Family Controls**.
4. Corre en tu iPhone (Screen Time exige dispositivo real, no simulador).

Qué hace: pide el permiso de Tiempo en Pantalla → el usuario elige apps y
sitios de apuestas con el selector de Apple → los bloquea hasta que termine el
período de compromiso.

---

## ¿Por qué no es "un botón y ya" como Android?

Porque Apple no da a las apps acceso profundo al sistema. Lo bueno es que la
Opción A, con el código de Tiempo en Pantalla en manos de otra persona, es en la
práctica **muy difícil de saltar** — más incluso que muchas apps, porque está
integrada en iOS.

## Limitación honesta
Cualquier bloqueo en un iPhone no supervisado se puede quitar si se conoce el
código de Tiempo en Pantalla o borrando el dispositivo. Por eso lo esencial es
que **la clave la tenga alguien más** durante tu período de compromiso.
