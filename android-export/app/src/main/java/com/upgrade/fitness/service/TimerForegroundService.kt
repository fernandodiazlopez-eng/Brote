package com.upgrade.fitness.service

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.CountDownTimer
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.upgrade.fitness.MainActivity
import com.upgrade.fitness.audio.AudioRouter
import com.upgrade.fitness.util.VibrationHelper
import java.util.Locale

/**
 * Servicio en primer plano (Foreground Service) para el temporizador deportivo:
 * - Mantiene el cronómetro y la cuenta atrás activos de forma fiable con la pantalla apagada.
 * - Registra una alarma de hardware en AlarmManager para garantizar ejecución exacta en Doze.
 * - Enruta el audio exclusivamente a auriculares (vía AudioRouter) y dispara vibración háptica.
 */
class TimerForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "upgrade_timer_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START_TIMER = "com.upgrade.fitness.START_TIMER"
        const val ACTION_STOP_TIMER = "com.upgrade.fitness.STOP_TIMER"
        const val ACTION_ALARM_TRIGGERED = "com.upgrade.fitness.ALARM_TRIGGERED"

        const val EXTRA_DURATION_SECONDS = "extra_duration_seconds"
        const val EXTRA_LABEL = "extra_label"

        var isRunning: Boolean = false
            private set

        var remainingSeconds: Long = 0
            private set
    }

    private lateinit var audioRouter: AudioRouter
    private lateinit var vibrationHelper: VibrationHelper
    private lateinit var notificationManager: NotificationManager
    private lateinit var alarmManager: AlarmManager

    private var countDownTimer: CountDownTimer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var alarmPendingIntent: PendingIntent? = null
    private var currentLabel: String = "Descanso"

    override fun onCreate() {
        super.onCreate()
        audioRouter = AudioRouter(this)
        vibrationHelper = VibrationHelper(this)
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager

        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "UpgradeFitness:TimerWakeLock"
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_TIMER -> {
                val seconds = intent.getLongExtra(EXTRA_DURATION_SECONDS, 60L)
                currentLabel = intent.getStringExtra(EXTRA_LABEL) ?: "Descanso"
                startCountdown(seconds)
            }
            ACTION_STOP_TIMER -> {
                stopCountdown()
            }
            ACTION_ALARM_TRIGGERED -> {
                onCountdownFinished()
            }
        }
        return START_NOT_STICKY
    }

    private fun startCountdown(totalSeconds: Long) {
        isRunning = true
        remainingSeconds = totalSeconds

        startForeground(NOTIFICATION_ID, buildNotification(totalSeconds))

        // Adquirir WakeLock para evitar congelación del procesador
        if (wakeLock?.isHeld == false) {
            wakeLock?.acquire( (totalSeconds + 10) * 1000L )
        }

        // Programar AlarmManager exacto como garantía infalible para Android Doze
        val triggerTimeMs = System.currentTimeMillis() + (totalSeconds * 1000L)
        val alarmIntent = Intent(this, AlarmReceiver::class.java)
        alarmPendingIntent = PendingIntent.getBroadcast(
            this,
            2002,
            alarmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerTimeMs,
                alarmPendingIntent!!
            )
        } else {
            alarmManager.setExact(
                AlarmManager.RTC_WAKEUP,
                triggerTimeMs,
                alarmPendingIntent!!
            )
        }

        // Timer visual para actualizar la notificación cada segundo
        countDownTimer?.cancel()
        countDownTimer = object : CountDownTimer(totalSeconds * 1000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                remainingSeconds = millisUntilFinished / 1000L
                notificationManager.notify(NOTIFICATION_ID, buildNotification(remainingSeconds))
            }

            override fun onFinish() {
                onCountdownFinished()
            }
        }.start()
    }

    private fun onCountdownFinished() {
        countDownTimer?.cancel()
        alarmPendingIntent?.let { alarmManager.cancel(it) }

        // 1. Vibración háptica del dispositivo
        vibrationHelper.vibrateTimerFinished()

        // 2. Audio EXCLUSIVO en auriculares (no sonará jamás por el altavoz)
        audioRouter.playAlarmIfHeadphonesConnected(durationMs = 4500)

        // 3. Notificación final de tiempo cumplido
        val finishedNotification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("¡Tiempo terminado! · Upgrade")
            .setContentText("$currentLabel completado. ¡A por la siguiente serie!")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, finishedNotification)

        // Notificar a MainActivity si está en memoria
        MainActivity.notifyTimerFinished()

        stopSelf()
    }

    private fun stopCountdown() {
        isRunning = false
        countDownTimer?.cancel()
        alarmPendingIntent?.let { alarmManager.cancel(it) }
        audioRouter.stopAlarm()
        vibrationHelper.cancel()

        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification(secondsLeft: Long): Notification {
        val minutes = secondsLeft / 60
        val secs = secondsLeft % 60
        val timeFormatted = String.format(Locale.getDefault(), "%02d:%02d", minutes, secs)

        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val openAppPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val cancelIntent = Intent(this, TimerForegroundService::class.java).apply {
            action = ACTION_STOP_TIMER
        }
        val cancelPendingIntent = PendingIntent.getService(
            this,
            1,
            cancelIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("$timeFormatted · $currentLabel")
            .setContentText("Temporizador activo de Upgrade en segundo plano")
            .setContentIntent(openAppPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Detener", cancelPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Temporizador de Entrenamiento",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notificaciones del cronómetro y descanso en segundo plano"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopCountdown()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
