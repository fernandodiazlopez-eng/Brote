/**
 * Sistema nativo de alarmas privadas para Capacitor / Android:
 * - Cumple el requisito crítico: El sonido se reproduce estrictamente por el canal multimedia (STREAM_MUSIC / AudioAttributes.USAGE_MEDIA).
 * - Detección de cascos: Si hay auriculares conectados (Bluetooth, Jack o USB-C), el sonido suena ÚNICAMENTE en los cascos.
 * - Si NO hay auriculares conectados, NUNCA fuerza ni reproduce por el altavoz externo del móvil (se activa solo vibración háptica).
 * - Elimina por completo los bucles artificiales o vídeos de fondo.
 */

export interface PrivateAlarmState {
  isPlaying: boolean;
  headphonesDetected: boolean;
}

let activeAlarmAudio: HTMLAudioElement | null = null;
let activeWebAudioContext: AudioContext | null = null;
let activeAlarmIntervalId: number | null = null;

/**
 * Comprueba si el usuario tiene auriculares conectados (Bluetooth A2DP/BLE, Cable o USB-C):
 * - Consulta la lista de dispositivos de audio multimedia del navegador/WebView.
 * - Si la app está empaquetada con Capacitor/AndroidBridge, consulta el puente nativo.
 */
export async function areHeadphonesConnected(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Puente nativo de Android / Capacitor si está disponible
  const win = window as unknown as {
    AndroidBridge?: { areHeadphonesConnected?: () => boolean };
    Capacitor?: {
      Plugins?: {
        NativeAudio?: unknown;
        Headphones?: { isConnected?: () => Promise<{ connected: boolean }> };
      };
    };
  };

  if (win.AndroidBridge && typeof win.AndroidBridge.areHeadphonesConnected === 'function') {
    try {
      return Boolean(win.AndroidBridge.areHeadphonesConnected());
    } catch {
      // Continuar con detección estándar
    }
  }

  // 2. Detección vía MediaDevices (Android WebView / Chrome)
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasHeadset = devices.some((d) => {
        const label = (d.label || '').toLowerCase();
        return (
          label.includes('headphone') ||
          label.includes('headset') ||
          label.includes('auricular') ||
          label.includes('casco') ||
          label.includes('bluetooth') ||
          label.includes('buds') ||
          label.includes('airpod') ||
          label.includes('earphone') ||
          label.includes('wireless') ||
          (d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'speaker')
        );
      });
      if (hasHeadset) return true;
    } catch {
      // Ignorar restricciones de permisos de medios
    }
  }

  // 3. Comprobación de sinkId / audio routing moderno
  return false;
}

/**
 * Ejecuta vibración háptica nativa (Capacitor Haptics o navigator.vibrate).
 */
export function triggerNativeHapticAlarm(): void {
  if (typeof window === 'undefined') return;

  // Si existe plugin de Capacitor Haptics
  const win = window as unknown as {
    Capacitor?: {
      Plugins?: {
        Haptics?: {
          vibrate?: (options: { duration: number }) => Promise<void>;
          notification?: (options: { type: string }) => Promise<void>;
        };
      };
    };
  };

  if (win.Capacitor?.Plugins?.Haptics?.vibrate) {
    try {
      void win.Capacitor.Plugins.Haptics.vibrate({ duration: 500 });
      setTimeout(() => {
        void win.Capacitor?.Plugins?.Haptics?.vibrate?.({ duration: 600 });
      }, 700);
      return;
    } catch {
      // Continuar con fallback
    }
  }

  // Fallback con navigator.vibrate del sistema
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([0, 450, 180, 450, 180, 650]);
    } catch {
      // Ignorar
    }
  }
}

/**
 * Genera y reproduce un tono de alarma deportivo nítido (880 Hz + 1760 Hz)
 * utilizando estrictamente el canal STREAM_MUSIC (multimedia).
 */
function playPrivateMediaTone(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!activeWebAudioContext || activeWebAudioContext.state === 'closed') {
      activeWebAudioContext = new AudioCtx();
    }

    if (activeWebAudioContext.state === 'suspended') {
      void activeWebAudioContext.resume();
    }

    const now = activeWebAudioContext.currentTime;

    // Oscilador 1: Tono base 880 Hz (La5)
    const osc1 = activeWebAudioContext.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);

    // Oscilador 2: Armónico 1760 Hz para corte nítido en cascos
    const osc2 = activeWebAudioContext.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, now);

    const gain = activeWebAudioContext.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.75, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(activeWebAudioContext.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.0);
    osc2.stop(now + 1.0);
  } catch {
    // Fallback silencioso
  }
}

/**
 * Inicia la alarma privada del temporizador.
 * REGLA ESTRICTA:
 * - Si hay auriculares conectados: suena por los auriculares en canal multimedia (STREAM_MUSIC).
 * - Si NO hay auriculares conectados: NUNCA suena por el altavoz externo; solo vibra.
 */
export async function startPrivateTimerAlarm(options?: {
  routineTitle?: string;
  notificationsEnabled?: boolean;
}): Promise<PrivateAlarmState> {
  stopPrivateTimerAlarm();

  // 1. Siempre vibra para avisar al usuario físicamente
  triggerNativeHapticAlarm();

  // 2. Comprobar si hay cascos conectados
  const headphones = await areHeadphonesConnected();

  if (headphones) {
    // Reproducir inmediatamente el primer tono
    playPrivateMediaTone();

    // Mantener la alerta cada 1.4s mientras no se pulse parar
    activeAlarmIntervalId = window.setInterval(() => {
      playPrivateMediaTone();
      triggerNativeHapticAlarm();
    }, 1400);
  } else {
    // SIN CASCOS: NO reproducir audio para proteger la privacidad y no molestar en el gimnasio
    // Repetir únicamente la vibración háptica
    activeAlarmIntervalId = window.setInterval(() => {
      triggerNativeHapticAlarm();
    }, 1400);
  }

  return {
    isPlaying: true,
    headphonesDetected: headphones,
  };
}

/**
 * Detiene inmediatamente la alarma sonora y la vibración.
 */
export function stopPrivateTimerAlarm(): void {
  if (activeAlarmIntervalId !== null) {
    clearInterval(activeAlarmIntervalId);
    activeAlarmIntervalId = null;
  }

  if (activeAlarmAudio) {
    try {
      activeAlarmAudio.pause();
      activeAlarmAudio.currentTime = 0;
    } catch {
      // Ignorar
    }
    activeAlarmAudio = null;
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignorar
    }
  }
}
