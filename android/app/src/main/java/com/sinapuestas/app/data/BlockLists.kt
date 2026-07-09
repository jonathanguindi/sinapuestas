package com.sinapuestas.app.data

import android.content.Context
import com.sinapuestas.app.R

/** Carga y consulta las listas de dominios y paquetes bloqueados (res/raw). */
object BlockLists {

    @Volatile private var domains: Set<String>? = null
    @Volatile private var packageTokens: List<String>? = null
    @Volatile private var keywords: List<String>? = null

    fun blockedDomains(c: Context): Set<String> = domains ?: synchronized(this) {
        domains ?: loadLines(c, R.raw.blocked_domains)
            .map { it.lowercase().trimEnd('.') }.toSet().also { domains = it }
    }

    fun blockedPackageTokens(c: Context): List<String> = packageTokens ?: synchronized(this) {
        packageTokens ?: loadLines(c, R.raw.blocked_packages)
            .map { it.lowercase() }.also { packageTokens = it }
    }

    /** Palabras clave para atrapar casas de apuestas fuera de la lista. */
    fun keywords(c: Context): List<String> = keywords ?: synchronized(this) {
        keywords ?: loadLines(c, R.raw.blocked_keywords)
            .map { it.lowercase() }.also { keywords = it }
    }

    /** true si [domain] es un dominio bloqueado o subdominio de uno. */
    fun isDomainBlocked(c: Context, domain: String): Boolean {
        val d = domain.lowercase().trimEnd('.')
        if (d.isEmpty()) return false
        val list = blockedDomains(c)
        if (d in list) return true
        var idx = d.indexOf('.')
        while (idx in 0 until d.length - 1) {
            if (d.substring(idx + 1) in list) return true
            idx = d.indexOf('.', idx + 1)
        }
        return false
    }

    fun isPackageBlocked(c: Context, packageName: String): Boolean {
        val p = packageName.lowercase()
        if (blockedPackageTokens(c).any { it.isNotEmpty() && p.contains(it) }) return true
        // Capa 2: palabras clave (atrapa apps de apuestas no listadas).
        return keywords(c).any { it.isNotEmpty() && p.contains(it) }
    }

    /** Busca en un texto (p. ej. la barra de direcciones) un dominio bloqueado. */
    fun textContainsBlockedDomain(c: Context, text: String): Boolean {
        val t = text.lowercase()
        if (blockedDomains(c).any { t.contains(it) }) return true
        // Capa 2: palabras clave en la URL (atrapa casas no listadas).
        return keywords(c).any { it.isNotEmpty() && t.contains(it) }
    }

    private fun loadLines(c: Context, resId: Int): List<String> =
        c.resources.openRawResource(resId).bufferedReader().useLines { lines ->
            lines.map { it.substringBefore('#').trim() }.filter { it.isNotEmpty() }.toList()
        }
}
