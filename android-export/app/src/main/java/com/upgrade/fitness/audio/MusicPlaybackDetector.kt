package com.upgrade.fitness.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Detector nativo en tiempo real de reproducción de música externa (Spotify, YouTube Music, Apple Music, etc.):
 * - Registra AudioPlaybackCallback en Android 8.0+ (API 26+) / Android 10+ (API 29+).
 * - Utiliza AudioManager.isMusicActive() para detección continua.
 * - Avisa instantáneamente a la app web para que Bug empiece a bailar al ritmo de la música.
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
            checkCurrentMusicState()
            mainHandler.postDelayed(this, 1800L) // Verificación periódica ligera
        }
    }

    fun start() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                playbackCallback = object : AudioManager.AudioPlaybackCallback() {
                    override fun onPlaybackConfigChanged(configs: List<AudioPlaybackConfiguration>) {
                        val hasActiveMedia = configs.any { config ->
                            val isMediaUsage = config.audioAttributes.usage == AudioAttributes.USAGE_MEDIA ||
                                    config.audioAttributes.usage == AudioAttributes.USAGE_GAME
                            val isActive = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                config.isActive
                            } else true
                            isMediaUsage && isActive
                        }
                        val isMusicActive = hasActiveMedia || audioManager.isMusicActive
                        updateState(isMusicActive)
                    }
                }
                audioManager.registerAudioPlaybackCallback(playbackCallback!!, mainHandler)
            } catch (e: Exception) {
                Log.w("MusicDetector", "No se pudo registrar AudioPlaybackCallback: ${e.message}")
            }
        }

        // Comprobación inicial y sondeo de respaldo
        mainHandler.post(pollRunnable)
    }

    private fun checkCurrentMusicState() {
        val active = audioManager.isMusicActive
        updateState(active)
    }

    private fun updateState(active: Boolean) {
        if (active != isCurrentlyPlaying) {
            isCurrentlyPlaying = active
            onMusicStateChanged(active)
        }
    }

    fun stop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && playbackCallback != null) {
            try {
                audioManager.unregisterAudioPlaybackCallback(playbackCallback!!)
            } catch (e: Exception) {
                // Ignorar
            }
            playbackCallback = null
        }
        mainHandler.removeCallbacks(pollRunnable)
    }
}
