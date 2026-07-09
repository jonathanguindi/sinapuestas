import SwiftUI
import FamilyControls

struct ContentView: View {
    @StateObject private var model = BlockModel()
    @State private var showPicker = false
    @State private var days = 30
    @State private var message = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Bloquea las apps y los sitios de apuestas en tu iPhone usando Tiempo en Pantalla de Apple. No usa VPN.")
                        .font(.subheadline)
                }

                if model.protectionOn {
                    Section("Estado") {
                        Label(model.commitmentActive
                              ? "Protección activa · faltan \(model.remainingDays) días"
                              : "Protección activa", systemImage: "shield.fill")
                            .foregroundStyle(.green)
                    }
                }

                Section("1. Permiso de Tiempo en Pantalla") {
                    Button(model.isAuthorized ? "✓ Permiso concedido" : "Conceder permiso") {
                        Task { await model.requestAuthorization() }
                    }
                    .disabled(model.isAuthorized)
                }

                Section("2. Elegir qué bloquear") {
                    Button("Seleccionar apps y sitios de apuestas") { showPicker = true }
                        .disabled(!model.isAuthorized)
                    Text("Elige las casas de apuestas que tengas instaladas y añade sus sitios web.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("3. Compromiso") {
                    Picker("Días sin poder desactivar", selection: $days) {
                        Text("7").tag(7); Text("30").tag(30)
                        Text("90").tag(90); Text("365").tag(365)
                    }
                    Button("Activar bloqueo") { model.activate(days: days) }
                        .disabled(!model.isAuthorized)
                }

                Section {
                    Button("Desactivar (tras el compromiso)") {
                        message = model.deactivate()
                            ? "Protección desactivada."
                            : "Aún faltan \(model.remainingDays) días. Ánimo, vas bien. 💪"
                    }
                    .foregroundStyle(.red)
                    if !message.isEmpty {
                        Text(message).font(.caption)
                    }
                }
            }
            .navigationTitle("SinApuestas")
            .familyActivityPicker(isPresented: $showPicker, selection: $model.selection)
        }
    }
}

#Preview {
    ContentView()
}
