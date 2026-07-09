import SwiftUI

// Punto de entrada de la app de iPhone.
//
// IMPORTANTE (honestidad): en iPhone ninguna app puede bloquear otras apps
// "por su cuenta". La unica via oficial es el framework Family Controls /
// Screen Time de Apple, que ESTA app usa. Requiere el "entitlement" especial
// `com.apple.developer.family-controls`, que Apple concede tras una solicitud
// (ver README de la carpeta apple/). Con el permiso concedido, esta app deja
// que el usuario elija apps de apuestas y sitios web y los "escuda" (shield)
// hasta que termine el periodo de compromiso.

@main
struct SinApuestasApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
