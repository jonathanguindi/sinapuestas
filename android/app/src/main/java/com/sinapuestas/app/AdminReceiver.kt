package com.sinapuestas.app

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context

/**
 * Administrador de dispositivo. Estar activo como administrador significa que
 * Android NO permite desinstalar la app hasta desactivar primero al
 * administrador; y esa pantalla la vigila el servicio de accesibilidad, que
 * exige la contrasena de custodio. Asi se logra que sea muy dificil de quitar.
 */
class AdminReceiver : DeviceAdminReceiver() {

    override fun onDisableRequested(context: Context, intent: android.content.Intent): CharSequence {
        return context.getString(R.string.admin_disable_warning)
    }

    companion object {
        fun component(context: Context) = ComponentName(context, AdminReceiver::class.java)
    }
}
