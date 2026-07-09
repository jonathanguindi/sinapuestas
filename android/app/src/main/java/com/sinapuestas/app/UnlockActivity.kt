package com.sinapuestas.app

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.sinapuestas.app.data.Guardian

/**
 * Desbloqueo: pide la contrasena de custodio. Si es correcta y ya paso el
 * periodo de compromiso, apaga la proteccion y libera al administrador de
 * dispositivo (para poder desinstalar). Si el compromiso sigue activo, avisa
 * los dias que faltan.
 */
class UnlockActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_unlock)

        val info = findViewById<TextView>(R.id.unlock_info)
        val days = Guardian.remainingDays(this)
        info.text = if (Guardian.isCommitmentActive(this))
            getString(R.string.unlock_committed, days)
        else getString(R.string.unlock_free)

        findViewById<Button>(R.id.btn_confirm_unlock).setOnClickListener {
            val pwd = findViewById<EditText>(R.id.unlock_password).text.toString()
            if (!Guardian.checkPassword(this, pwd)) {
                Toast.makeText(this, R.string.unlock_wrong, Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (Guardian.isCommitmentActive(this)) {
                Toast.makeText(this, getString(R.string.unlock_still_committed, days), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            Guardian.deactivate(this, pwd)
            releaseAdmin()
            Toast.makeText(this, R.string.unlock_done, Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun releaseAdmin() {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = AdminReceiver.component(this)
        if (dpm.isAdminActive(admin)) dpm.removeActiveAdmin(admin)
    }
}
