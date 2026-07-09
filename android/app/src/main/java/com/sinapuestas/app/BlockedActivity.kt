package com.sinapuestas.app

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.sinapuestas.app.data.Guardian

/** Pantalla de apoyo que cubre una app o web de apuestas al intentar abrirla. */
class BlockedActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_BLOCKED_PACKAGE = "blocked_package"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_blocked)

        val days = Guardian.remainingDays(this)
        findViewById<TextView>(R.id.blocked_subtitle).text =
            if (days > 0) getString(R.string.blocked_subtitle_days, days)
            else getString(R.string.blocked_subtitle)

        findViewById<Button>(R.id.btn_go_home).setOnClickListener { goHome() }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = goHome()

    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }
}
