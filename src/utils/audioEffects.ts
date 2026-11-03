/**
 * Efectos de sonido Web Audio + respaldo en segundo plano y pantalla bloqueada:
 * - En reposo usa sesión 'ambient' y suspende el AudioContext para no interferir con Spotify / Apple Music.
 * - Mientras corre una cuenta atrás activa, mantiene vivo el canal de audio con un bucle PCM silencioso
 *   corto (< 5s para no robar el foco multimedia en Android), cambia a sesión 'transient' en iOS 17+
 *   (que sí suena con la pantalla bloqueada sin cortar la música), pre-programa la alarma directamente
 *   en el reloj de hardware de WebAudio y delega también el aviso sonoro/vibración en el Service Worker.
 */

import { TrophyTier } from '../types';

let sharedAudioContext: AudioContext | null = null;
let alarmLoopIntervalId: number | null = null;
let idleSuspendTimeoutId: number | null = null;
let activeSoundEffectsCount = 0;

let isCountdownArmed = false;
let keepAliveSourceNode: AudioScheduledSourceNode | null = null;
let keepAliveGainNode: GainNode | null = null;
let preScheduledAlarmNodes: AudioNode[] = [];

let silentWavUrl: string | null = null;
let alarmChimeWavUrl: string | null = null;
let silentKeepAliveAudio: HTMLAudioElement | null = null;
let alarmFallbackAudio: HTMLAudioElement | null = null;

function configureAudioSessionMode(mode: 'ambient' | 'transient'): void {
  if (typeof navigator === 'undefined') return;
  try {
    const navWithAudioSession = navigator as Navigator & {
      audioSession?: { type: string };
    };
    if (!navWithAudioSession.audioSession) return;
    if (navWithAudioSession.audioSession.type !== mode) {
      try {
        navWithAudioSession.audioSession.type = mode;
      } catch {
        if (mode === 'transient') {
          navWithAudioSession.audioSession.type = 'playback';
        }
      }
    }
  } catch {
    // Ignorar en navegadores sin soporte para navigator.audioSession
  }
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  configureAudioSessionMode(
    isCountdownArmed || alarmLoopIntervalId !== null ? 'transient' : 'ambient'
  );

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
    if (isCountdownArmed || alarmLoopIntervalId !== null || activeSoundEffectsCount > 0) {
      return;
    }

    configureAudioSessionMode('ambient');
    if (sharedAudioContext && sharedAudioContext.state === 'running') {
      void sharedAudioContext.suspend().catch(() => {});
    }
  }, delayMs);
}

/** Genera un archivo WAV PCM de 16 bits en memoria (sin archivos externos). */
function buildMonoWavBlobUrl(samples: Float32Array, sampleRate: number): string | null {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // formato lineal
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function getOrCreateSilentWavUrl(): string | null {
  if (silentWavUrl) return silentWavUrl;
  // 1.0 segundo (< 5s para que Android Chrome lo clasifique como Ambient y no pause Spotify)
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate);
  silentWavUrl = buildMonoWavBlobUrl(samples, sampleRate);
  return silentWavUrl;
}

function getOrCreateAlarmChimeWavUrl(): string | null {
  if (alarmChimeWavUrl) return alarmChimeWavUrl;
  // Ciclo de 1.5s con las 4 notas de la alarma [880, 1046.5, 880, 1318.5]
  const sampleRate = 22050;
  const durationSec = 1.5;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(totalSamples);

  const notes = [
    { freq: 880, start: 0.0, dur: 0.14 },
    { freq: 1046.5, start: 0.18, dur: 0.14 },
    { freq: 880, start: 0.36, dur: 0.14 },
    { freq: 1318.5, start: 0.54, dur: 0.28 },
  ];

  for (const n of notes) {
    const startIdx = Math.floor(n.start * sampleRate);
    const len = Math.floor(n.dur * sampleRate);
    for (let i = 0; i < len && startIdx + i < totalSamples; i += 1) {
      const t = i / sampleRate;
      const env =
        t < 0.02 ? t / 0.02 : Math.pow(Math.max(0, 1 - (t - 0.02) / (n.dur - 0.02)), 2.1);
      samples[startIdx + i] += Math.sin(2 * Math.PI * n.freq * t) * 0.42 * env;
    }
  }

  alarmChimeWavUrl = buildMonoWavBlobUrl(samples, sampleRate);
  return alarmChimeWavUrl;
}

function getOrCreateSilentKeepAliveAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!silentKeepAliveAudio) {
    const url = getOrCreateSilentWavUrl();
    if (!url) return null;
    const el = new Audio(url);
    el.loop = true;
    el.volume = 0.01;
    el.setAttribute('playsinline', 'true');
    silentKeepAliveAudio = el;
  }
  return silentKeepAliveAudio;
}

function getOrCreateAlarmFallbackAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!alarmFallbackAudio) {
    const url = getOrCreateAlarmChimeWavUrl();
    if (!url) return null;
    const el = new Audio(url);
    el.loop = true;
    el.volume = 0.9;
    el.setAttribute('playsinline', 'true');
    alarmFallbackAudio = el;
  }
  return alarmFallbackAudio;
}

function clearWebAudioPreScheduledAlarm(): void {
  for (const node of preScheduledAlarmNodes) {
    try {
      if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
        (node as AudioScheduledSourceNode).stop();
      }
    } catch {
      // Ignorar nodos ya finalizados
    }
    try {
      node.disconnect();
    } catch {
      // Ignorar desconexión repetida
    }
  }
  preScheduledAlarmNodes = [];

  if (keepAliveSourceNode) {
    try {
      keepAliveSourceNode.stop();
    } catch {
      // Ignorar
    }
    try {
      keepAliveSourceNode.disconnect();
    } catch {
      // Ignorar
    }
    keepAliveSourceNode = null;
  }
  if (keepAliveGainNode) {
    try {
      keepAliveGainNode.disconnect();
    } catch {
      // Ignorar
    }
    keepAliveGainNode = null;
  }
}

function scheduleChimeBurstAtContextTime(ctx: AudioContext, baseStartTime: number): void {
  const notesHz = [880, 1046.5, 880, 1318.5];
  const offsetsSec = [0, 0.18, 0.36, 0.54];
  const durationsSec = [0.14, 0.14, 0.14, 0.28];

  notesHz.forEach((freq, idx) => {
    const t0 = baseStartTime + offsetsSec[idx];
    const dur = durationsSec[idx];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);

    preScheduledAlarmNodes.push(osc, gain);
  });
}

function postMessageToServiceWorker(payload: Record<string, unknown>): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload);
      return;
    }
    void navigator.serviceWorker.ready
      .then((reg) => {
        reg.active?.postMessage(payload);
      })
      .catch(() => {});
  } catch {
    // Ignorar errores de mensajería con el Service Worker
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined';
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Solicita permiso de notificaciones del sistema únicamente cuando el usuario lo acepta
 * de forma explícita (en el diálogo único inicial o desde Ajustes).
 */
export async function requestTimerNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface AlarmNotificationCopy {
  title: string;
  tapToStop: string;
  restDone: string;
}

/**
 * Arma el audio y el aviso en segundo plano justo en el gesto táctil de iniciar la cuenta atrás:
 * 1) Mantiene activo el AudioContext y pre-programa la alarma en el reloj de hardware (`ctx.currentTime + delay`)
 *    para que suene puntual aunque el navegador congele los timers JS con la pantalla apagada.
 * 2) Activa un bucle WAV silencioso de 1s y desbloquea el reproductor HTML5 de respaldo.
 * 3) Programa la notificación con sonido y vibración en el Service Worker (si el usuario dio permiso).
 */
export function armCountdownBackgroundAudio(
  durationMs: number,
  routineTitle?: string,
  copy?: AlarmNotificationCopy,
  notificationsEnabled = true
): void {
  clearWebAudioPreScheduledAlarm();
  cancelScheduledSuspend();
  isCountdownArmed = true;
  configureAudioSessionMode('transient');

  const safeDelaySec = Math.max(0.05, durationMs / 1000);

  try {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }

      // Nodo silencioso continuo para evitar que el sistema suspenda el AudioContext durante el descanso
      const silentGain = ctx.createGain();
      silentGain.gain.setValueAtTime(0.00001, ctx.currentTime);
      silentGain.connect(ctx.destination);
      keepAliveGainNode = silentGain;

      if (typeof ctx.createConstantSource === 'function') {
        const constantSource = ctx.createConstantSource();
        constantSource.offset.setValueAtTime(0.0001, ctx.currentTime);
        constantSource.connect(silentGain);
        constantSource.start();
        keepAliveSourceNode = constantSource;
      } else {
        const silentOsc = ctx.createOscillator();
        silentOsc.frequency.setValueAtTime(1, ctx.currentTime);
        silentOsc.connect(silentGain);
        silentOsc.start();
        keepAliveSourceNode = silentOsc;
      }

      // Pre-programar 24 ráfagas (36 segundos) directamente en el hilo de hardware de WebAudio
      const targetAudioTime = ctx.currentTime + safeDelaySec;
      for (let cycle = 0; cycle < 24; cycle += 1) {
        scheduleChimeBurstAtContextTime(ctx, targetAudioTime + cycle * 1.5);
      }
    }
  } catch {
    // Ignorar restricciones de WebAudio
  }

  // Bucle silencioso corto (<5s) y desbloqueo en gesto del canal HTML5 de respaldo
  try {
    const silentAudio = getOrCreateSilentKeepAliveAudio();
    if (silentAudio) {
      silentAudio.currentTime = 0;
      void silentAudio.play().catch(() => {});
    }
    const fallbackAudio = getOrCreateAlarmFallbackAudio();
    if (fallbackAudio && fallbackAudio.paused) {
      fallbackAudio.muted = true;
      void fallbackAudio
        .play()
        .then(() => {
          if (alarmLoopIntervalId === null) {
            fallbackAudio.pause();
            fallbackAudio.currentTime = 0;
          }
          fallbackAudio.muted = false;
        })
        .catch(() => {
          fallbackAudio.muted = false;
        });
    }
  } catch {
    // Ignorar restricciones de HTMLAudioElement
  }

  // Programar aviso del sistema en el Service Worker (sin pedir permiso por sorpresa)
  if (
    notificationsEnabled &&
    isNotificationSupported() &&
    Notification.permission === 'granted'
  ) {
    const notificationTitle = copy?.title || 'Temporizador finalizado';
    const tapToStop = copy?.tapToStop || 'Pulsa para parar la alarma';
    const restDone = copy?.restDone || 'Tiempo de descanso completado';
    const notificationBody = routineTitle ? `${routineTitle} · ${tapToStop}` : restDone;

    postMessageToServiceWorker({
      type: 'SCHEDULE_TIMER_ALARM',
      endMs: Date.now() + Math.max(0, Math.round(durationMs)),
      title: notificationTitle,
      body: notificationBody,
    });
  }
}

/** Cancela cualquier alarma pre-programada al pausar, reiniciar o editar el temporizador. */
export function disarmCountdownBackgroundAudio(): void {
  isCountdownArmed = false;
  clearWebAudioPreScheduledAlarm();

  if (silentKeepAliveAudio && !silentKeepAliveAudio.paused) {
    try {
      silentKeepAliveAudio.pause();
      silentKeepAliveAudio.currentTime = 0;
    } catch {
      // Ignorar
    }
  }

  postMessageToServiceWorker({ type: 'CANCEL_TIMER_ALARM' });

  if (alarmLoopIntervalId === null) {
    scheduleAudioSuspendWhenIdle(100);
  }
}

/** Compatibilidad directa para desbloquear el contexto sin pedir permisos invasivos. */
export function prepareCountdownAudio(): void {
  configureAudioSessionMode('transient');
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {
    // Ignorar restricciones de reproducción automática
  }
}

/** Si una alarma sigue activa al desbloquear o volver a la app, reanuda el audio. */
export function resumeAlarmAudioIfNeeded(): void {
  if (alarmLoopIntervalId === null && !isCountdownArmed) return;
  try {
    configureAudioSessionMode('transient');
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => {});
    }
    if (alarmLoopIntervalId !== null && alarmFallbackAudio && !alarmFallbackAudio.paused) {
      // Si el contexto principal ya está sonando en primer plano, evitar duplicar con el canal HTML5
      if (sharedAudioContext && sharedAudioContext.state === 'running') {
        alarmFallbackAudio.pause();
        alarmFallbackAudio.currentTime = 0;
      }
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

let lastBugBounceMs = 0;

/** Rebote arcade estilo 8-bits cuando Bug colisiona contra las paredes en modo Air Hockey (Nivel 5+). */
export function playBugBounceSound(speedRatio = 0.7): void {
  const nowWallMs = Date.now();
  if (nowWallMs - lastBugBounceMs < 42) return;
  lastBugBounceMs = nowWallMs;

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    cancelScheduledSuspend();
    activeSoundEffectsCount += 1;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const clampedRatio = Math.max(0.25, Math.min(1, speedRatio));
    const baseFreq = 260 + clampedRatio * 180;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.setValueAtTime(baseFreq * 1.5, now + 0.024);

    const peakGain = 0.055 + clampedRatio * 0.055;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.062);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.onended = () => {
      activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // Ignorar errores de desconexión
      }
      scheduleAudioSuspendWhenIdle(120);
    };

    osc.start(now);
    osc.stop(now + 0.068);
  } catch {
    activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
    scheduleAudioSuspendWhenIdle(120);
  }
}

/** Jingle retro 8-bits al descubrir a Bug (Nivel 3), acariciarlo (Nivel 4) o jugar con él (Nivel 5). */
export function playBugUnlockSound(isPlayUnlock = false): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    cancelScheduledSuspend();
    activeSoundEffectsCount += 1;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const notes = isPlayUnlock
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [440, 554.37, 659.25, 880];
    const stepSec = 0.075;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.connect(ctx.destination);

    notes.forEach((freq, idx) => {
      const start = now + idx * stepSec;
      const dur = idx === notes.length - 1 ? 0.24 : 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    });

    if (typeof window !== 'undefined') {
      const totalMs = Math.round((notes.length * stepSec + 0.3) * 1000);
      window.setTimeout(() => {
        activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
        try {
          filter.disconnect();
        } catch {
          // Ignorar errores de desconexión
        }
        scheduleAudioSuspendWhenIdle(120);
      }, totalMs);
    } else {
      activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
    }
  } catch {
    activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
    scheduleAudioSuspendWhenIdle(120);
  }
}

function playAlarmChimeOnce(): void {
  try {
    configureAudioSessionMode('transient');
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
      gain.gain.exponentialRampToValueAtTime(0.32, now + offsetsSec[idx] + 0.02);
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
      navigator.vibrate([260, 120, 260]);
    }
  } catch {
    // Ignorar errores de reproducción
  }
}

export function startTimerAlarm(
  routineTitle?: string,
  copy?: AlarmNotificationCopy,
  notificationsEnabled = true
): void {
  if (alarmLoopIntervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(alarmLoopIntervalId);
    alarmLoopIntervalId = null;
  }

  isCountdownArmed = false;
  clearWebAudioPreScheduledAlarm();
  if (silentKeepAliveAudio && !silentKeepAliveAudio.paused) {
    try {
      silentKeepAliveAudio.pause();
      silentKeepAliveAudio.currentTime = 0;
    } catch {
      // Ignorar
    }
  }

  cancelScheduledSuspend();
  configureAudioSessionMode('transient');
  playAlarmChimeOnce();

  // Si la app está en segundo plano / pantalla apagada o el AudioContext está suspendido, activar también el WAV HTML5
  const isHidden =
    typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (isHidden || !sharedAudioContext || sharedAudioContext.state !== 'running') {
    const fallbackAudio = getOrCreateAlarmFallbackAudio();
    if (fallbackAudio) {
      fallbackAudio.muted = false;
      fallbackAudio.currentTime = 0;
      void fallbackAudio.play().catch(() => {});
    }
  }

  if (typeof window !== 'undefined') {
    alarmLoopIntervalId = window.setInterval(() => {
      playAlarmChimeOnce();
    }, 1500);
  }

  if (!notificationsEnabled) return;

  try {
    if (isNotificationSupported() && Notification.permission === 'granted') {
      const notificationTitle = copy?.title || 'Temporizador finalizado';
      const tapToStop = copy?.tapToStop || 'Pulsa para parar la alarma';
      const restDone = copy?.restDone || 'Tiempo de descanso completado';
      const notificationBody = routineTitle ? `${routineTitle} · ${tapToStop}` : restDone;

      const notifIcon = '/pwa-192x192.png';

      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.ready
          .then((registration) => {
            const options: NotificationOptions & {
              renotify?: boolean;
              vibrate?: number[];
            } = {
              body: notificationBody,
              icon: notifIcon,
              badge: notifIcon,
              tag: 'timer-alarm',
              renotify: true,
              requireInteraction: true,
              silent: false,
              vibrate: [320, 120, 320, 120, 460],
            };
            return registration.showNotification(notificationTitle, options);
          })
          .catch(() => {
            new Notification(notificationTitle, {
              body: notificationBody,
              icon: notifIcon,
              tag: 'timer-alarm',
              silent: false,
            });
          });
      } else {
        new Notification(notificationTitle, {
          body: notificationBody,
          icon: notifIcon,
          tag: 'timer-alarm',
          silent: false,
        });
      }
    }
  } catch {
    // Ignorar errores de notificación
  }
}

export function stopTimerAlarm(): void {
  isCountdownArmed = false;
  clearWebAudioPreScheduledAlarm();

  if (alarmLoopIntervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(alarmLoopIntervalId);
    alarmLoopIntervalId = null;
  }

  if (silentKeepAliveAudio && !silentKeepAliveAudio.paused) {
    try {
      silentKeepAliveAudio.pause();
      silentKeepAliveAudio.currentTime = 0;
    } catch {
      // Ignorar
    }
  }

  if (alarmFallbackAudio && !alarmFallbackAudio.paused) {
    try {
      alarmFallbackAudio.pause();
      alarmFallbackAudio.currentTime = 0;
    } catch {
      // Ignorar
    }
  }

  postMessageToServiceWorker({ type: 'CANCEL_TIMER_ALARM' });

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
