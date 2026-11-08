package com.upgrade.fitness.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.util.Log
import kotlin.math.sin

/**
 * Enrutador de audio para el temporizador de Upgrade:
 * - Cumple estrictamente la regla: El audio de la alarma suena ÚNICAMENTE
 *   por auriculares (Bluetooth A2DP/BLE, Jack 3.5mm o USB-C).
 * - Si NO hay auriculares conectados, NUNCA sonará por el altavoz externo
 *   del teléfono (quedando solo la vibración nativa para no molestar en el gimnasio).
 */
class AudioRouter(private val context: Context) {

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var activeAudioTrack: AudioTrack? = null

    /**
     * Comprueba si hay algún dispositivo de auriculares conectado:
     * - Auriculares Bluetooth (A2DP, BLE Headset, SCO)
     * - Auriculares de cable (Jack 3.5mm, USB-C Audio)
     */
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

    /**
     * Obtiene el dispositivo de auriculares preferido si está disponible.
     */
    private fun getPreferredHeadphonesDevice(): AudioDeviceInfo? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            return devices.firstOrNull { device ->
                device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                device.type == AudioDeviceInfo.TYPE_USB_HEADSET
            }
        }
        return null
    }

    /**
     * Reproduce la alarma sonora potente multi-armónica.
     * Si no hay auriculares conectados, aborta la reproducción de inmediato
     * para garantizar que JAMÁS suene por el altavoz externo.
     */
    fun playAlarmIfHeadphonesConnected(durationMs: Long = 4000) {
        if (!areHeadphonesConnected()) {
            Log.i("AudioRouter", "Auriculares NO detectados. Alarma sonora cancelada para no usar el altavoz.")
            return
        }

        stopAlarm()

        try {
            val sampleRate = 44100
            val totalSamples = ((durationMs / 1000.0) * sampleRate).toInt()
            val audioData = ShortArray(totalSamples)

            // Generador de tono deportivo multi-armónico Nothing OS (880 Hz + 1760 Hz pulsante)
            val baseFreq = 880.0
            val harmonicFreq = 1760.0
            val pulseFreq = 4.0 // 4 pulsos por segundo

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

            // Forzar enrutamiento exclusivo al dispositivo de auriculares (Android M+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val targetDevice = getPreferredHeadphonesDevice()
                if (targetDevice != null) {
                    track.preferredDevice = targetDevice
                } else {
                    // Si justo se desconectaron en ese milisegundo, no reproducir por altavoz
                    track.release()
                    return
                }
            }

            track.write(audioData, 0, audioData.size)
            track.play()
            activeAudioTrack = track

        } catch (e: Exception) {
            Log.e("AudioRouter", "Error al inicializar AudioTrack: ${e.message}", e)
        }
    }

    fun stopAlarm() {
        try {
            activeAudioTrack?.let {
                if (it.playState == AudioTrack.PLAYSTATE_PLAYING) {
                    it.stop()
                }
                it.release()
            }
        } catch (e: Exception) {
            Log.w("AudioRouter", "Error al detener audio: ${e.message}")
        } finally {
            activeAudioTrack = null
        }
    }
}
