/**
 * Efectos de sonido Web Audio optimizados para entrenar en móvil con música externa
 * (Spotify, Apple Music, YouTube Music):
 * - Usa sesión de audio 'ambient' en iOS 17+ para mezclar sin pausar ni atenuar la música.
 * - Suspende y desconecta automáticamente el AudioContext cuando está en silencio.
 */

import { TrophyTier } from '../types';

let sharedAudioContext: AudioContext | null = null;
let alarmLoopIntervalId: number | null = null;
let idleSuspendTimeoutId: number | null = null;
let activeSoundEffectsCount = 0;

function configureAmbientAudioSession(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const navWithAudioSession = navigator as Navigator & {
      audioSession?: { type: string };
    };
    if (
      navWithAudioSession.audioSession &&
      navWithAudioSession.audioSession.type !== 'ambient'
    ) {
      navWithAudioSession.audioSession.type = 'ambient';
    }
  } catch {
    // Ignorar en navegadores sin soporte para navigator.audioSession
  }
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  configureAmbientAudioSession();

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

function cancelScheduledSuspend(): void {
  if (idleSuspendTimeoutId !== null && typeof window !== 'undefined') {
    window.clearTimeout(idleSuspendTimeoutId);
    idleSuspendTimeoutId = null;
  }
}

function scheduleAudioSuspendWhenIdle(delayMs = 180): void {
  if (typeof window === 'undefined') return;
  cancelScheduledSuspend();

  idleSuspendTimeoutId = window.setTimeout(() => {
    idleSuspendTimeoutId = null;
    if (alarmLoopIntervalId !== null || activeSoundEffectsCount > 0) return;

    if (sharedAudioContext && sharedAudioContext.state === 'running') {
      void sharedAudioContext.suspend().catch(() => {});
    }
  }, delayMs);
}

/**
 * Se invoca únicamente al iniciar un temporizador con cuenta atrás:
 * desbloquea el AudioContext en el gesto táctil y lo suspende a los 80ms para no afectar la música,
 * además de solicitar permiso de notificaciones si aún no se ha decidido.
 */
export function prepareCountdownAudio(): void {
  configureAmbientAudioSession();

  try {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          scheduleAudioSuspendWhenIdle(80);
        })
        .catch(() => {});
    }
  } catch {
    // Ignorar restricciones de reproducción automática
  }

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {});
    }
  } catch {
    // Ignorar en contextos restringidos / iframes
  }
}

/** Si una alarma sigue activa al desbloquear o volver a la app, reanuda el audio. */
export function resumeAlarmAudioIfNeeded(): void {
  if (alarmLoopIntervalId === null) return;
  try {
    configureAmbientAudioSession();
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => {});
    }
  } catch {
    // Ignorar errores de reanudación
  }
}

/** Acorde cristalino estilo consola al desbloquear un logro, adaptado al rango del trofeo. */
export function playTrophyUnlockSound(tier: TrophyTier): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    cancelScheduledSuspend();
    activeSoundEffectsCount += 1;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const isEpic = tier === 'platino' || tier === 'diamante';
    const isGold = tier === 'oro';

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-15, now);
    compressor.knee.setValueAtTime(16, now);
    compressor.ratio.setValueAtTime(3.5, now);
    compressor.attack.setValueAtTime(0.006, now);
    compressor.release.setValueAtTime(0.22, now);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(isEpic ? 2950 : 2650, now);
    lowpass.frequency.exponentialRampToValueAtTime(
      isEpic ? 1550 : 1380,
      now + (isEpic ? 1.85 : 1.4)
    );
    lowpass.Q.setValueAtTime(0.9, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.68, now);

    lowpass.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    // Pulso inicial suave
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(155, now);
    popOsc.frequency.exponentialRampToValueAtTime(65, now + 0.07);
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    popOsc.connect(popGain);
    popGain.connect(compressor);
    popOsc.start(now);
    popOsc.stop(now + 0.1);

    const playHarmonicNote = (
      frequencyHz: number,
      startOffsetSec: number,
      attackSec: number,
      durationSec: number,
      peakGain: number,
      withWarmChorus = true
    ) => {
      const startTime = now + startOffsetSec;

      const sineOsc = ctx.createOscillator();
      const sineGain = ctx.createGain();
      sineOsc.type = 'sine';
      sineOsc.frequency.setValueAtTime(frequencyHz, startTime);
      sineGain.gain.setValueAtTime(0.0001, startTime);
      sineGain.gain.linearRampToValueAtTime(peakGain, startTime + attackSec);
      sineGain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
      sineOsc.connect(sineGain);
      sineGain.connect(lowpass);
      sineOsc.start(startTime);
      sineOsc.stop(startTime + durationSec + 0.04);

      if (withWarmChorus) {
        for (const detuneCents of [-4, 4]) {
          const warmOsc = ctx.createOscillator();
          const warmGain = ctx.createGain();
          warmOsc.type = 'triangle';
          warmOsc.frequency.setValueAtTime(frequencyHz, startTime);
          warmOsc.detune.setValueAtTime(detuneCents, startTime);
          warmGain.gain.setValueAtTime(0.0001, startTime);
          warmGain.gain.linearRampToValueAtTime(peakGain * 0.45, startTime + attackSec * 1.1);
          warmGain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec * 0.9);
          warmOsc.connect(warmGain);
          warmGain.connect(lowpass);
          warmOsc.start(startTime);
          warmOsc.stop(startTime + durationSec + 0.04);
        }
      }
    };

    if (isEpic) {
      playHarmonicNote(196.0, 0.0, 0.015, 0.48, 0.18, false);
      playHarmonicNote(293.66, 0.0, 0.016, 0.5, 0.17, true);
      playHarmonicNote(392.0, 0.0, 0.018, 0.52, 0.16, true);

      playHarmonicNote(130.81, 0.12, 0.03, 1.75, 0.2, false);
      playHarmonicNote(261.63, 0.12, 0.025, 1.7, 0.2, true);
      playHarmonicNote(392.0, 0.125, 0.028, 1.65, 0.16, true);
      playHarmonicNote(493.88, 0.13, 0.03, 1.65, 0.14, true);
      playHarmonicNote(659.25, 0.135, 0.032, 1.7, 0.16, true);

      playHarmonicNote(783.99, 0.24, 0.04, 1.7, 0.13, true);
      playHarmonicNote(987.77, 0.26, 0.045, 1.65, 0.09, true);
    } else if (isGold) {
      playHarmonicNote(164.81, 0.0, 0.015, 0.45, 0.18, false);
      playHarmonicNote(329.63, 0.0, 0.016, 0.46, 0.17, true);
      playHarmonicNote(493.88, 0.008, 0.018, 0.48, 0.15, true);

      playHarmonicNote(220.0, 0.12, 0.028, 1.5, 0.22, true);
      playHarmonicNote(329.63, 0.125, 0.03, 1.45, 0.16, true);
      playHarmonicNote(415.3, 0.13, 0.032, 1.4, 0.13, true);
      playHarmonicNote(554.37, 0.135, 0.032, 1.5, 0.16, true);
      playHarmonicNote(659.25, 0.23, 0.04, 1.45, 0.13, true);
      playHarmonicNote(830.61, 0.25, 0.045, 1.35, 0.08, true);
    } else {
      playHarmonicNote(146.83, 0.0, 0.014, 0.38, 0.16, false);
      playHarmonicNote(293.66, 0.0, 0.015, 0.42, 0.2, true);
      playHarmonicNote(440.0, 0.0, 0.018, 0.44, 0.16, true);

      playHarmonicNote(196.0, 0.115, 0.026, 1.3, 0.22, false);
      playHarmonicNote(293.66, 0.12, 0.028, 1.25, 0.17, true);
      playHarmonicNote(369.99, 0.125, 0.03, 1.25, 0.14, true);
      playHarmonicNote(440.0, 0.13, 0.03, 1.25, 0.14, true);
      playHarmonicNote(587.33, 0.135, 0.03, 1.32, 0.17, true);
      playHarmonicNote(739.99, 0.145, 0.035, 1.15, 0.09, true);
    }

    if (typeof window !== 'undefined') {
      const cleanupDelayMs = isEpic ? 2250 : isGold ? 1950 : 1700;
      window.setTimeout(() => {
        activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
        try {
          lowpass.disconnect();
          masterGain.disconnect();
          compressor.disconnect();
        } catch {
          // Ignorar errores de desconexión
        }
        scheduleAudioSuspendWhenIdle(120);
      }, cleanupDelayMs);
    } else {
      activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(isEpic ? [50, 40, 110] : isGold ? [45, 35, 75] : [60]);
    }
  } catch {
    activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
    scheduleAudioSuspendWhenIdle(120);
  }
}

function playAlarmChimeOnce(): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    cancelScheduledSuspend();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const notesHz = [880, 1046.5, 880, 1318.5];
    const offsetsSec = [0, 0.18, 0.36, 0.54];
    const durationsSec = [0.14, 0.14, 0.14, 0.28];

    notesHz.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offsetsSec[idx]);

      gain.gain.setValueAtTime(0.001, now + offsetsSec[idx]);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offsetsSec[idx] + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + offsetsSec[idx] + durationsSec[idx]
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Ignorar errores de desconexión
        }
      };

      osc.start(now + offsetsSec[idx]);
      osc.stop(now + offsetsSec[idx] + durationsSec[idx] + 0.02);
    });

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([250, 120, 250]);
    }
  } catch {
    // Ignorar errores de reproducción
  }
}

export interface AlarmNotificationCopy {
  title: string;
  tapToStop: string;
  restDone: string;
}

export function startTimerAlarm(
  routineTitle?: string,
  copy?: AlarmNotificationCopy
): void {
  stopTimerAlarm();
  cancelScheduledSuspend();
  playAlarmChimeOnce();

  if (typeof window !== 'undefined') {
    alarmLoopIntervalId = window.setInterval(() => {
      playAlarmChimeOnce();
    }, 1500);
  }

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const notificationTitle = copy?.title || 'Temporizador finalizado';
      const tapToStop = copy?.tapToStop || 'Pulsa para parar la alarma';
      const restDone = copy?.restDone || 'Tiempo de descanso completado';
      const notificationBody = routineTitle ? `${routineTitle} · ${tapToStop}` : restDone;

      const isLightMode =
        typeof document !== 'undefined' &&
        document.documentElement.dataset.themeMode === 'light';
      const notifIcon = isLightMode ? '/pwa-light-192x192.png' : '/pwa-dark-192x192.png';

      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.ready
          .then((registration) =>
            registration.showNotification(notificationTitle, {
              body: notificationBody,
              icon: notifIcon,
              tag: 'timer-alarm',
              requireInteraction: true,
            })
          )
          .catch(() => {
            new Notification(notificationTitle, {
              body: notificationBody,
              icon: notifIcon,
            });
          });
      } else {
        new Notification(notificationTitle, {
          body: notificationBody,
          icon: notifIcon,
        });
      }
    }
  } catch {
    // Ignorar errores de notificación
  }
}

export function stopTimerAlarm(): void {
  if (alarmLoopIntervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(alarmLoopIntervalId);
    alarmLoopIntervalId = null;
  }

  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {
    // Ignorar errores de vibración
  }

  // Cerrar cualquier notificación activa en la barra del sistema
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.getNotifications({ tag: 'timer-alarm' }))
        .then((notifications) => {
          notifications?.forEach((n) => n.close());
        })
        .catch(() => {});
    }
  } catch {
    // Ignorar errores al limpiar notificaciones
  }

  scheduleAudioSuspendWhenIdle(80);
}
