package com.sinapuestas.app

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.view.accessibility.AccessibilityManager
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.sinapuestas.app.data.Guardian

/**
 * Pantalla unica de configuracion. El flujo es simple:
 *   1) Pones una contrasena (idealmente la guarda otra persona) y eliges dias.
 *   2) Tocas "Activar" y la app te lleva a aprobar los 2 permisos del sistema:
 *        - Accesibilidad  -> para bloquear apps y webs de apuestas.
 *        - Administrador   -> para que no se pueda desinstalar facil.
 *   3) Listo: bloquea todo.
 */
class MainActivity : AppCompatActivity() {

    private val notifPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private var selectedDays = 30

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        if (Build.VERSION.SDK_INT >= 33) {
            notifPermLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }

        findViewById<RadioGroup>(R.id.duration_group).setOnCheckedChangeListener { _, id ->
            selectedDays = when (id) {
                R.id.duration_7 -> 7
                R.id.duration_90 -> 90
                R.id.duration_365 -> 365
                else -> 30
            }
        }

        findViewById<Button>(R.id.btn_activate).setOnClickListener { onActivate() }
        findViewById<Button>(R.id.btn_accessibility).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            Toast.makeText(this, R.string.hint_accessibility, Toast.LENGTH_LONG).show()
        }
        findViewById<Button>(R.id.btn_admin).setOnClickListener { requestAdmin() }
        findViewById<Button>(R.id.btn_unlock).setOnClickListener {
            startActivity(Intent(this, UnlockActivity::class.java))
        }
        findViewById<Button>(R.id.btn_help).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://www.jugadoresanonimos.org/")))
        }
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun onActivate() {
        if (Guardian.isConfigured(this)) {
            requestMissingPermissions()
            return
        }
        val p1 = findViewById<EditText>(R.id.password).text.toString()
        val p2 = findViewById<EditText>(R.id.password_confirm).text.toString()
        if (p1.length < 4) {
            Toast.makeText(this, R.string.err_password_short, Toast.LENGTH_LONG).show(); return
        }
        if (p1 != p2) {
            Toast.makeText(this, R.string.err_password_mismatch, Toast.LENGTH_LONG).show(); return
        }
        Guardian.setup(this, p1, selectedDays)
        Toast.makeText(this, R.string.protection_configured, Toast.LENGTH_LONG).show()
        requestMissingPermissions()
    }

    /** Pide, uno por uno, los permisos que falten. */
    private fun requestMissingPermissions() {
        if (!isAccessibilityEnabled()) {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            Toast.makeText(this, R.string.hint_accessibility, Toast.LENGTH_LONG).show()
            return
        }
        if (!isAdminActive()) {
            requestAdmin()
            return
        }
        Toast.makeText(this, R.string.protection_ready, Toast.LENGTH_LONG).show()
        refreshStatus()
    }

    private fun requestAdmin() {
        if (isAdminActive()) {
            Toast.makeText(this, R.string.admin_already, Toast.LENGTH_SHORT).show(); return
        }
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, AdminReceiver.component(this))
            .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, getString(R.string.admin_explanation))
        startActivity(intent)
    }

    private fun isAdminActive(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isAdminActive(AdminReceiver.component(this))
    }

    private fun isAccessibilityEnabled(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabled = Settings.Secure.getString(
            contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val me = "$packageName/com.sinapuestas.app.accessibility.AppBlockerService"
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabled)
        while (splitter.hasNext()) if (splitter.next().equals(me, true)) return am.isEnabled
        return false
    }

    private fun refreshStatus() {
        val status = findViewById<TextView>(R.id.status_text)
        val acc = isAccessibilityEnabled()
        val adm = isAdminActive()
        val on = Guardian.isProtectionOn(this)

        status.text = when {
            on && acc && adm -> {
                val d = Guardian.remainingDays(this)
                if (d > 0) getString(R.string.status_full_days, d) else getString(R.string.status_full)
            }
            on && (acc || adm) -> getString(R.string.status_partial)
            on -> getString(R.string.status_need_permissions)
            else -> getString(R.string.status_off)
        }

        findViewById<Button>(R.id.btn_accessibility).text =
            getString(if (acc) R.string.perm_accessibility_ok else R.string.perm_accessibility)
        findViewById<Button>(R.id.btn_admin).text =
            getString(if (adm) R.string.perm_admin_ok else R.string.perm_admin)
    }
}
