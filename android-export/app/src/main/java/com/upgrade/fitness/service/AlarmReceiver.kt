package com.upgrade.fitness.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receptor de alarma exacta para despertar el sistema operativo incluso
 * en modo Doze (pantalla apagada profunda) al llegar a 00:00 en el temporizador.
 */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val serviceIntent = Intent(context, TimerForegroundService::class.java).apply {
            action = TimerForegroundService.ACTION_ALARM_TRIGGERED
        }
        context.startService(serviceIntent)
    }
}
