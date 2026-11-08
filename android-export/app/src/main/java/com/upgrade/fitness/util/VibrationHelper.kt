package com.upgrade.fitness.util

import android.content.Context
import android.os.Build
import android.os.CombinedVibration
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Gestor de vibración háptica nativa para las alertas del temporizador.
 * Utiliza VibratorManager en Android 12 (API 31+) y Vibrator clásico en versiones previas.
 */
class VibrationHelper(private val context: Context) {

    private val vibratorManager: VibratorManager? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        } else null

    private val legacyVibrator: Vibrator? =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        } else null

    /**
     * Dispara un patrón háptico deportivo de 3 ráfagas al terminar el temporizador.
     * Patrón: Pausa 0ms -> Vibra 400ms -> Pausa 150ms -> Vibra 400ms -> Pausa 150ms -> Vibra 600ms
     */
    fun vibrateTimerFinished() {
        val timings = longArrayOf(0, 400, 150, 400, 150, 600)
        val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && vibratorManager != null) {
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            val combined = CombinedVibration.createParallel(effect)
            vibratorManager.vibrate(combined)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator?.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            legacyVibrator?.vibrate(timings, -1)
        }
    }

    fun cancel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            vibratorManager?.cancel()
        } else {
            @Suppress("DEPRECATION")
            legacyVibrator?.cancel()
        }
    }
}
