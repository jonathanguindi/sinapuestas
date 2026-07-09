package com.sinapuestas.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * El servicio de accesibilidad se reactiva solo tras reiniciar. Este receptor
 * queda como punto de extension (p. ej. reponer notificacion); la proteccion
 * en si depende del estado guardado en Guardian, que persiste el reinicio.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Nada que arrancar manualmente: la accesibilidad y el admin persisten.
    }
}
