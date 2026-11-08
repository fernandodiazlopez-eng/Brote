package com.upgrade.fitness

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.media.AudioTrack
import android.os.Build
import android.os.Bundle
import android.os.CombinedVibration
import android.os.CountDownTimer
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import kotlin.math.sin

/**
 * ==============================================================================
 * UPGRADE FITNESS - ARCHIVO TODO-EN-UNO PARA ANDROID STUDIO (KOTLIN)
 * ==============================================================================
 * Este archivo contiene absolutamente TODO lo necesario:
 * 1. MainActivity con WebView de pantalla completa cargando tu app exacta.
 * 2. Detector automático de música (Spotify / YouTube Music / Apple Music) para que Bug baile.
 * 3. Temporizador con ForegroundService y AlarmManager (funciona con pantalla apagada en segundo plano).
 * 4. Alarma sonora EXCLUSIVA en auriculares (NUNCA suena por el altavoz externo del móvil).
 * 5. Vibración háptica nativa al terminar la cuenta atrás.
 * 6. Integración unificada con Health Connect (pasos y calorías de relojes/apps de salud).
 * ==============================================================================
 */

class MainActivity : AppCompatActivity() {

    companion object {
        private var instanceRef: WeakReference<MainActivity>? = null

        fun notifyTimerFinished() {
            instanceRef?.get()?.runOnUiThread {
                instanceRef?.get()?.webView?.evaluateJavascript(
                    "if (window.onNativeTimerFinished) { window.onNativeTimerFinished(); }",
                    null
                )
            }
        }
    }

    private lateinit var webView: WebView
    private lateinit var healthConnectManager: HealthConnectManager
    private lateinit var audioRouter: AudioRouter
    private lateinit var musicPlaybackDetector: MusicPlaybackDetector

    // Permisos de Health Connect
    private val healthPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { grantedPermissions ->
        lifecycleScope.launch {
            if (grantedPermissions.containsAll(healthConnectManager.requiredPermissions)) {
                syncHealthData()
            } else {
                Toast.makeText(this@MainActivity, "Permisos de Health Connect incompletos", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Permiso de notificaciones en Android 13+
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instanceRef = WeakReference(this)

        // Crear WebView programáticamente a pantalla completa (sin necesidad de tocar layouts XML)
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#090A0C"))
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#090A0C"))
        }
        rootLayout.addView(webView)
        setContentView(rootLayout)

        healthConnectManager = HealthConnectManager(this)
        audioRouter = AudioRouter(this)

        // Detector de música nativo para Bug
        musicPlaybackDetector = MusicPlaybackDetector(this) { isPlaying ->
            notifyMusicPlaybackChanged(isPlaying)
        }

        setupWebView()
        requestSystemPermissions()

        // Cargar tu aplicación:
        // Primero intenta cargar la versión compilada local en assets si existe;
        // si no, carga la URL en vivo directamente:
        val localAssetUrl = "file:///android_asset/dist/index.html"
        val liveCloudUrl = "https://ais-pre-2jpxhfdo4bxnxffoakvzeb-570644915366.europe-west1.run.app"

        try {
            assets.open("dist/index.html").close()
            webView.loadUrl(localAssetUrl)
        } catch (e: Exception) {
            webView.loadUrl(liveCloudUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                syncHealthData()
                val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                notifyMusicPlaybackChanged(audioManager.isMusicActive)
            }
        }

        webView.addJavascriptInterface(AndroidNativeBridge(), "AndroidBridge")
        webView.addJavascriptInterface(AndroidNativeBridge(), "AndroidStepCounter")
    }

    override fun onResume() {
        super.onResume()
        musicPlaybackDetector.start()
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        notifyMusicPlaybackChanged(audioManager.isMusicActive)
    }

    override fun onPause() {
        super.onPause()
        musicPlaybackDetector.stop()
    }

    private fun requestSystemPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    fun notifyMusicPlaybackChanged(isPlaying: Boolean) {
        runOnUiThread {
            webView.evaluateJavascript(
                """
                if (window.onNativeMusicPlaybackChanged) {
                    window.onNativeMusicPlaybackChanged($isPlaying);
                }
                window.dispatchEvent(new CustomEvent('nativeMusicPlayback', { detail: { isPlaying: $isPlaying } }));
                """.trimIndent(),
                null
            )
        }
    }

    fun syncHealthData() {
        lifecycleScope.launch {
            val summary = healthConnectManager.getTodayHealthSummary()
            val json = JSONObject().apply {
                put("steps", summary.stepsToday)
                put("calories", summary.caloriesBurnedTodayKcal)
                put("distanceKm", summary.distanceTodayKm)
                put("isHealthConnectAvailable", summary.isHealthConnectAvailable)
                put("hasPermissions", summary.hasPermissions)
            }

            runOnUiThread {
                webView.evaluateJavascript(
                    """
                    if (window.onNativeHealthDataUpdated) {
                        window.onNativeHealthDataUpdated($json);
                    }
                    window.dispatchEvent(new CustomEvent('nativeHealthUpdate', { detail: $json }));
                    """.trimIndent(),
                    null
                )
            }
        }
    }

    inner class AndroidNativeBridge {

        @JavascriptInterface
        fun startTimer(seconds: Long, label: String) {
            runOnUiThread {
                val serviceIntent = Intent(this@MainActivity, TimerForegroundService::class.java).apply {
                    action = TimerForegroundService.ACTION_START_TIMER
                    putExtra(TimerForegroundService.EXTRA_DURATION_SECONDS, seconds)
                    putExtra(TimerForegroundService.EXTRA_LABEL, label)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent)
                } else {
                    startService(serviceIntent)
                }
            }
        }

        @JavascriptInterface
        fun stopTimer() {
            runOnUiThread {
                val serviceIntent = Intent(this@MainActivity, TimerForegroundService::class.java).apply {
                    action = TimerForegroundService.ACTION_STOP_TIMER
                }
                startService(serviceIntent)
            }
        }

        @JavascriptInterface
        fun areHeadphonesConnected(): Boolean {
            return audioRouter.areHeadphonesConnected()
        }

        @JavascriptInterface
        fun isMusicPlaying(): Boolean {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            return audioManager.isMusicActive
        }

        @JavascriptInterface
        fun requestHealthConnectPermissions() {
            runOnUiThread {
                if (healthConnectManager.isAvailable()) {
                    healthPermissionLauncher.launch(healthConnectManager.requiredPermissions)
                } else {
                    Toast.makeText(this@MainActivity, "Health Connect no está instalado", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun requestHealthSync() {
            syncHealthData()
        }

        @JavascriptInterface
        fun requestPermission(): String {
            requestHealthConnectPermissions()
            return "prompt"
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}

/**
 * ==============================================================================
 * SERVICIO EN SEGUNDO PLANO PARA TEMPORIZADOR Y ALARMA EXACTA
 * ==============================================================================
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
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Upgrade:TimerWakeLock")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_TIMER -> {
                val seconds = intent.getLongExtra(EXTRA_DURATION_SECONDS, 60L)
                currentLabel = intent.getStringExtra(EXTRA_LABEL) ?: "Descanso"
                startCountdown(seconds)
            }
            ACTION_STOP_TIMER -> stopCountdown()
            ACTION_ALARM_TRIGGERED -> onCountdownFinished()
        }
        return START_NOT_STICKY
    }

    private fun startCountdown(totalSeconds: Long) {
        isRunning = true
        startForeground(NOTIFICATION_ID, buildNotification(totalSeconds))

        if (wakeLock?.isHeld == false) {
            wakeLock?.acquire((totalSeconds + 10) * 1000L)
        }

        val triggerTimeMs = System.currentTimeMillis() + (totalSeconds * 1000L)
        val alarmIntent = Intent(this, AlarmReceiver::class.java)
        alarmPendingIntent = PendingIntent.getBroadcast(
            this,
            2002,
            alarmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTimeMs, alarmPendingIntent!!)
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerTimeMs, alarmPendingIntent!!)
        }

        countDownTimer?.cancel()
        countDownTimer = object : CountDownTimer(totalSeconds * 1000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                val left = millisUntilFinished / 1000L
                notificationManager.notify(NOTIFICATION_ID, buildNotification(left))
            }

            override fun onFinish() {
                onCountdownFinished()
            }
        }.start()
    }

    private fun onCountdownFinished() {
        countDownTimer?.cancel()
        alarmPendingIntent?.let { alarmManager.cancel(it) }

        vibrationHelper.vibrateTimerFinished()
        audioRouter.playAlarmIfHeadphonesConnected(durationMs = 4500)

        val finishedNotification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("¡Tiempo terminado! · Upgrade")
            .setContentText("$currentLabel completado. ¡A por la siguiente serie!")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, finishedNotification)
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
            )
            notificationManager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopCountdown()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

/**
 * ==============================================================================
 * RECEPTOR DE ALARMA EXACTA PARA MODO DOZE
 * ==============================================================================
 */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val serviceIntent = Intent(context, TimerForegroundService::class.java).apply {
            action = TimerForegroundService.ACTION_ALARM_TRIGGERED
        }
        context.startService(serviceIntent)
    }
}

/**
 * ==============================================================================
 * DETECTOR EN TIEMPO REAL DE MÚSICA (SPOTIFY, YOUTUBE MUSIC, ETC.)
 * ==============================================================================
 */
class MusicPlaybackDetector(
    private val context: Context,
    private val onMusicStateChanged: (isPlaying: Boolean) -> Unit
) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private var playbackCallback: AudioManager.AudioPlaybackCallback? = null
    private var isCurrentlyPlaying = false

    private val pollRunnable = object : Runnable {
        override fun run() {
            val active = audioManager.isMusicActive
            if (active != isCurrentlyPlaying) {
                isCurrentlyPlaying = active
                onMusicStateChanged(active)
            }
            mainHandler.postDelayed(this, 1800L)
        }
    }

    fun start() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                playbackCallback = object : AudioManager.AudioPlaybackCallback() {
                    override fun onPlaybackConfigChanged(configs: List<AudioPlaybackConfiguration>) {
                        val hasActiveMedia = configs.any { config ->
                            val isMedia = config.audioAttributes.usage == AudioAttributes.USAGE_MEDIA ||
                                    config.audioAttributes.usage == AudioAttributes.USAGE_GAME
                            val active = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) config.isActive else true
                            isMedia && active
                        }
                        val isPlaying = hasActiveMedia || audioManager.isMusicActive
                        if (isPlaying != isCurrentlyPlaying) {
                            isCurrentlyPlaying = isPlaying
                            onMusicStateChanged(isPlaying)
                        }
                    }
                }
                audioManager.registerAudioPlaybackCallback(playbackCallback!!, mainHandler)
            } catch (e: Exception) {
                Log.w("MusicDetector", "Error al registrar callback: ${e.message}")
            }
        }
        mainHandler.post(pollRunnable)
    }

    fun stop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && playbackCallback != null) {
            try {
                audioManager.unregisterAudioPlaybackCallback(playbackCallback!!)
            } catch (e: Exception) { }
            playbackCallback = null
        }
        mainHandler.removeCallbacks(pollRunnable)
    }
}

/**
 * ==============================================================================
 * ENRUTAMIENTO DE ALARMA EXCLUSIVO PARA AURICULARES (JAMÁS EN ALTAVOZ)
 * ==============================================================================
 */
class AudioRouter(private val context: Context) {

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var activeAudioTrack: AudioTrack? = null

    fun areHeadphonesConnected(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            devices.any { device ->
                when (device.type) {
                    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                    AudioDeviceInfo.TYPE_WIRED_HEADSET,
                    AudioDeviceInfo.TYPE_USB_HEADSET,
                    AudioDeviceInfo.TYPE_USB_DEVICE,
                    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                    AudioDeviceInfo.TYPE_HEARING_AID,
                    AudioDeviceInfo.TYPE_BLE_HEADSET,
                    AudioDeviceInfo.TYPE_BLE_SPEAKER -> true
                    else -> false
                }
            }
        } else {
            @Suppress("DEPRECATION")
            audioManager.isWiredHeadsetOn || audioManager.isBluetoothA2dpOn
        }
    }

    fun playAlarmIfHeadphonesConnected(durationMs: Long = 4000) {
        if (!areHeadphonesConnected()) {
            Log.i("AudioRouter", "Auriculares NO detectados. No sonará por el altavoz.")
            return
        }

        stopAlarm()

        try {
            val sampleRate = 44100
            val totalSamples = ((durationMs / 1000.0) * sampleRate).toInt()
            val audioData = ShortArray(totalSamples)

            val baseFreq = 880.0
            val harmonicFreq = 1760.0
            val pulseFreq = 4.0

            for (i in 0 until totalSamples) {
                val t = i.toDouble() / sampleRate
                val pulseEnvelope = (0.5 * (1.0 + sin(2.0 * Math.PI * pulseFreq * t))).coerceIn(0.0, 1.0)
                val wave = (0.6 * sin(2.0 * Math.PI * baseFreq * t)) + (0.4 * sin(2.0 * Math.PI * harmonicFreq * t))
                val sampleValue = (wave * pulseEnvelope * Short.MAX_VALUE * 0.85).toInt()
                audioData[i] = sampleValue.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }

            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()

            val audioFormat = AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build()

            val bufferSize = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            ).coerceAtLeast(audioData.size * 2)

            val track = AudioTrack(
                audioAttributes,
                audioFormat,
                bufferSize,
                AudioTrack.MODE_STATIC,
                AudioManager.AUDIO_SESSION_ID_GENERATE
            )

            track.write(audioData, 0, audioData.size)
            track.play()
            activeAudioTrack = track

        } catch (e: Exception) {
            Log.e("AudioRouter", "Error: ${e.message}")
        }
    }

    fun stopAlarm() {
        try {
            activeAudioTrack?.let {
                if (it.playState == AudioTrack.PLAYSTATE_PLAYING) it.stop()
                it.release()
            }
        } catch (e: Exception) { }
        activeAudioTrack = null
    }
}

/**
 * ==============================================================================
 * VIBRACIÓN HÁPTICA DEL DISPOSITIVO
 * ==============================================================================
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) vibratorManager?.cancel()
        else {
            @Suppress("DEPRECATION")
            legacyVibrator?.cancel()
        }
    }
}

/**
 * ==============================================================================
 * CLIENTE DE HEALTH CONNECT (PASOS Y CALORÍAS DE APPS DE SALUD)
 * ==============================================================================
 */
data class HealthSummary(
    val stepsToday: Long = 0,
    val caloriesBurnedTodayKcal: Double = 0.0,
    val distanceTodayKm: Double = 0.0,
    val isHealthConnectAvailable: Boolean = false,
    val hasPermissions: Boolean = false
)

class HealthConnectManager(private val context: Context) {

    private val healthConnectClient: HealthConnectClient? by lazy {
        if (isAvailable()) HealthConnectClient.getOrCreate(context) else null
    }

    val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    )

    fun isAvailable(): Boolean = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun hasAllPermissions(): Boolean = withContext(Dispatchers.IO) {
        val client = healthConnectClient ?: return@withContext false
        val granted = client.permissionController.getGrantedPermissions()
        return@withContext granted.containsAll(requiredPermissions)
    }

    suspend fun getTodayHealthSummary(): HealthSummary = withContext(Dispatchers.IO) {
        val client = healthConnectClient ?: return@withContext HealthSummary(isHealthConnectAvailable = false)
        if (!hasAllPermissions()) {
            return@withContext HealthSummary(isHealthConnectAvailable = true, hasPermissions = false)
        }

        try {
            val zoneId = ZoneId.systemDefault()
            val startOfDay = LocalDate.now().atStartOfDay(zoneId).toInstant()
            val now = Instant.now()
            val timeRange = TimeRangeFilter.between(startOfDay, now)

            val request = AggregateRequest(
                metrics = setOf(
                    StepsRecord.COUNT_TOTAL,
                    TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                    DistanceRecord.DISTANCE_TOTAL
                ),
                timeRangeFilter = timeRange
            )

            val response = client.aggregate(request)
            val steps = response[StepsRecord.COUNT_TOTAL] ?: 0L
            val energy = response[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0
            val distanceMeters = response[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0

            return@withContext HealthSummary(
                stepsToday = steps,
                caloriesBurnedTodayKcal = energy,
                distanceTodayKm = distanceMeters / 1000.0,
                isHealthConnectAvailable = true,
                hasPermissions = true
            )
        } catch (e: Exception) {
            return@withContext HealthSummary(isHealthConnectAvailable = true, hasPermissions = true)
        }
    }
}
