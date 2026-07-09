import Foundation
import FamilyControls
import ManagedSettings
import SwiftUI

/// Gestiona el bloqueo usando Screen Time (Family Controls + ManagedSettings)
/// y un "candado de compromiso" guardado localmente.
@MainActor
final class BlockModel: ObservableObject {

    private let store = ManagedSettingsStore()
    private let defaults = UserDefaults.standard
    private let lockKey = "lock_until"
    private let onKey = "protection_on"

    /// Selección de apps/categorías/sitios que hace el usuario con el picker.
    @Published var selection = FamilyActivitySelection()
    @Published var isAuthorized = false
    @Published var protectionOn = false

    init() {
        protectionOn = defaults.bool(forKey: onKey)
    }

    var remainingDays: Int {
        let rem = defaults.double(forKey: lockKey) - Date().timeIntervalSince1970
        return max(0, Int((rem + 86_399) / 86_400))
    }

    var commitmentActive: Bool {
        protectionOn && Date().timeIntervalSince1970 < defaults.double(forKey: lockKey)
    }

    /// Pide el permiso de Screen Time (una vez).
    func requestAuthorization() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            isAuthorized = true
        } catch {
            isAuthorized = false
        }
    }

    /// Activa el bloqueo (escudo) sobre lo seleccionado, con compromiso en días.
    func activate(days: Int) {
        // Escudar apps y categorías elegidas.
        store.shield.applications = selection.applicationTokens.isEmpty
            ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? .none : .specific(selection.categoryTokens)
        // Escudar dominios web elegidos (Safari).
        store.shield.webDomains = selection.webDomainTokens.isEmpty
            ? nil : selection.webDomainTokens

        defaults.set(true, forKey: onKey)
        defaults.set(Date().timeIntervalSince1970 + Double(days) * 86_400, forKey: lockKey)
        protectionOn = true
    }

    /// Desactiva el bloqueo. Solo se permite si el compromiso ya terminó.
    /// Devuelve false si aún está en el período de compromiso.
    func deactivate() -> Bool {
        if commitmentActive { return false }
        store.shield.applications = nil
        store.shield.applicationCategories = .none
        store.shield.webDomains = nil
        defaults.set(false, forKey: onKey)
        protectionOn = false
        return true
    }
}
