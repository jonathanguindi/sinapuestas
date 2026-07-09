package com.sinapuestas.app.data

import android.content.Context
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Guardian: gestiona la contrasena de custodio y el "candado de compromiso".
 *
 * Idea central para que sea LO MAS DIFICIL DE DESBLOQUEAR:
 *  - Al configurar, una persona de confianza (o tu mismo, guardando la clave
 *    en un lugar inaccesible) pone una contrasena. Esa contrasena es la unica
 *    forma de desactivar la proteccion desde la app.
 *  - Ademas eliges un periodo de compromiso (dias). Aunque tengas la
 *    contrasena, la app pide confirmacion y muestra los dias restantes.
 *  - La contrasena se guarda SOLO como hash (SHA-256 + sal). No se puede
 *    recuperar leyendo el telefono.
 */
object Guardian {

    private const val PREFS = "sinapuestas_guard"
    private const val KEY_HASH = "pwd_hash"
    private const val KEY_SALT = "pwd_salt"
    private const val KEY_PROTECTION_ON = "protection_on"
    private const val KEY_LOCK_UNTIL = "lock_until"

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isConfigured(c: Context): Boolean = prefs(c).contains(KEY_HASH)

    fun setup(c: Context, password: String, commitmentDays: Int) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs(c).edit()
            .putString(KEY_SALT, salt.toHex())
            .putString(KEY_HASH, hash(password, salt))
            .putBoolean(KEY_PROTECTION_ON, true)
            .putLong(KEY_LOCK_UNTIL, System.currentTimeMillis() + commitmentDays * 86_400_000L)
            .apply()
    }

    fun checkPassword(c: Context, password: String): Boolean {
        val saltHex = prefs(c).getString(KEY_SALT, null) ?: return false
        val stored = prefs(c).getString(KEY_HASH, null) ?: return false
        return hash(password, saltHex.fromHex()) == stored
    }

    /** Desactiva la proteccion. Requiere la contrasena correcta. */
    fun deactivate(c: Context, password: String): Boolean {
        if (!checkPassword(c, password)) return false
        prefs(c).edit().putBoolean(KEY_PROTECTION_ON, false).apply()
        return true
    }

    fun isProtectionOn(c: Context): Boolean = prefs(c).getBoolean(KEY_PROTECTION_ON, false)

    fun lockUntil(c: Context): Long = prefs(c).getLong(KEY_LOCK_UNTIL, 0L)

    fun isCommitmentActive(c: Context): Boolean =
        isProtectionOn(c) && System.currentTimeMillis() < lockUntil(c)

    fun remainingDays(c: Context): Long {
        val r = lockUntil(c) - System.currentTimeMillis()
        return if (r <= 0) 0 else (r + 86_400_000L - 1) / 86_400_000L
    }

    private fun hash(password: String, salt: ByteArray): String {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt)
        return md.digest(password.toByteArray(Charsets.UTF_8)).toHex()
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private fun String.fromHex(): ByteArray =
        chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
