package com.sinapuestas.app.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.sinapuestas.app.BlockedActivity
import com.sinapuestas.app.data.BlockLists
import com.sinapuestas.app.data.Guardian

/**
 * El corazon del bloqueo SIN VPN. Con el permiso de Accesibilidad, Android
 * avisa a este servicio cada vez que cambia la ventana en primer plano. Con
 * eso hacemos tres cosas:
 *
 *  1) BLOQUEAR APPS DE APUESTAS: si la app que se abre es una casa de apuestas,
 *     la sacamos (HOME) y mostramos una pantalla de apoyo.
 *  2) BLOQUEAR WEBS DE APUESTAS: leemos la barra de direcciones del navegador;
 *     si contiene un dominio de apuestas, salimos de esa pagina.
 *  3) AUTO-DEFENSA (lo mas dificil de desbloquear): si alguien intenta abrir
 *     la ficha de la app para desinstalarla, desactivar el administrador de
 *     dispositivo o apagar este mismo servicio de accesibilidad, lo sacamos
 *     de esa pantalla — a menos que la proteccion ya este apagada con la
 *     contrasena de custodio.
 */
class AppBlockerService : AccessibilityService() {

    private var lastActionAt = 0L

    // Paquetes de pantallas del sistema que hay que vigilar para la auto-defensa.
    private val settingsPackages = setOf(
        "com.android.settings",
        "com.google.android.packageinstaller",
        "com.android.packageinstaller",
        "com.miui.securitycenter",   // MIUI (Xiaomi)
        "com.samsung.android.packageinstaller"
    )

    // Palabras que delatan una pantalla peligrosa (desinstalar / admin / accesibilidad).
    private val dangerKeywords = listOf(
        "desinstalar", "uninstall",
        "administrador de dispositivo", "device admin", "administradores del dispositivo",
        "accesibilidad", "accessibility",
        "sinapuestas", "sin apuestas"
    )

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) return

        if (!Guardian.isProtectionOn(this)) return
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return

        // 1) App de apuestas en primer plano.
        if (BlockLists.isPackageBlocked(this, pkg)) {
            bounceToBlockScreen(pkg)
            return
        }

        // 3) Auto-defensa: vigilar pantallas de ajustes que permitirian quitar la app.
        if (pkg in settingsPackages) {
            if (screenLooksDangerous()) {
                goHome()
                return
            }
        }

        // 2) Navegador: revisar la barra de direcciones / contenido por dominios.
        if (looksLikeBrowser(pkg)) {
            val url = findUrlText(rootInActiveWindow)
            if (url != null && BlockLists.textContainsBlockedDomain(this, url)) {
                bounceToBlockScreen(pkg)
            }
        }
    }

    /** Recorre el arbol de accesibilidad buscando texto de una URL bloqueada. */
    private fun findUrlText(root: AccessibilityNodeInfo?): String? {
        root ?: return null
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.addLast(root)
        var visited = 0
        while (stack.isNotEmpty() && visited < 400) {
            val node = stack.removeLast()
            visited++
            val text = node.text?.toString()
            if (!text.isNullOrEmpty() && (text.contains('.')) &&
                BlockLists.textContainsBlockedDomain(this, text)
            ) return text
            for (i in 0 until node.childCount) node.getChild(i)?.let { stack.addLast(it) }
        }
        return null
    }

    /** true si en la pantalla actual aparece texto de desinstalar/admin/accesibilidad. */
    private fun screenLooksDangerous(): Boolean {
        val root = rootInActiveWindow ?: return false
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.addLast(root)
        var visited = 0
        var mentionsApp = false
        var mentionsDanger = false
        while (stack.isNotEmpty() && visited < 400) {
            val node = stack.removeLast()
            visited++
            val text = (node.text?.toString() ?: "").lowercase() +
                " " + (node.contentDescription?.toString() ?: "").lowercase()
            if (text.contains("sinapuestas") || text.contains("sin apuestas")) mentionsApp = true
            if (dangerKeywords.any { text.contains(it) }) mentionsDanger = true
            if (mentionsApp && mentionsDanger) return true
            for (i in 0 until node.childCount) node.getChild(i)?.let { stack.addLast(it) }
        }
        // Pantalla de lista de administradores o accesibilidad, aunque no nombre la app.
        return mentionsDanger && root.packageName?.toString() in settingsPackages &&
            (screenText(root).contains("administrador") || screenText(root).contains("accesibilidad"))
    }

    private fun screenText(root: AccessibilityNodeInfo): String {
        val sb = StringBuilder()
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.addLast(root)
        var visited = 0
        while (stack.isNotEmpty() && visited < 200) {
            val n = stack.removeLast(); visited++
            n.text?.let { sb.append(it).append(' ') }
            for (i in 0 until n.childCount) n.getChild(i)?.let { stack.addLast(it) }
        }
        return sb.toString().lowercase()
    }

    private fun looksLikeBrowser(pkg: String): Boolean =
        pkg.contains("chrome") || pkg.contains("firefox") || pkg.contains("browser") ||
            pkg.contains("opera") || pkg.contains("brave") || pkg.contains("samsung.android.sbrowser") ||
            pkg.contains("duckduckgo") || pkg.contains("edge")

    private fun bounceToBlockScreen(blockedPackage: String) {
        val now = System.currentTimeMillis()
        if (now - lastActionAt < 1200) return
        lastActionAt = now
        performGlobalAction(GLOBAL_ACTION_HOME)
        startActivity(
            Intent(this, BlockedActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(BlockedActivity.EXTRA_BLOCKED_PACKAGE, blockedPackage)
        )
    }

    private fun goHome() {
        val now = System.currentTimeMillis()
        if (now - lastActionAt < 800) return
        lastActionAt = now
        performGlobalAction(GLOBAL_ACTION_BACK)
        performGlobalAction(GLOBAL_ACTION_HOME)
    }

    override fun onInterrupt() = Unit
}
