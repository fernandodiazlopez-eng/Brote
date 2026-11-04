/**
 * Motor de audio de Upgrade con alarma real en segundo plano y pantalla bloqueada:
 * - Al iniciar la cuenta atrás (dentro del toque directo del usuario), genera en < 2 ms una pista WAV
 *   continua (`[piloto inaudible -80 dBFS durante el descanso] + [45 s de alarma potente multi-armónica]`,
 *   siempre >= 6 s para que Android Chrome e iOS Safari la traten como reproducción multimedia real
 *   `playback` y NO la silencien ni pausen al salir de la app o apagar la pantalla).
 * - Como el elemento `<audio>` ya está reproduciéndose desde el gesto del usuario, al llegar a `00:00`
 *   el decodificador nativo del móvil reproduce la alarma a máximo volumen aunque el sistema haya
 *   congelado JavaScript en segundo plano.
 * - En reposo (sin temporizador activo), libera la sesión a `'ambient'` y suspende el AudioContext.
 */

import { TrophyTier } from '../types';

let sharedAudioContext: AudioContext | null = null;
let alarmLoopIntervalId: number | null = null;
let idleSuspendTimeoutId: number | null = null;
let activeSoundEffectsCount = 0;

let isCountdownArmed = false;
let countdownTrackAudio: HTMLAudioElement | null = null;
let countdownTrackBlobUrl: string | null = null;
let alarmLoopTrackAudio: HTMLAudioElement | null = null;
let alarmLoopTrackBlobUrl: string | null = null;
const internalAudioElements = new WeakSet<HTMLMediaElement>();

export function isInternalAppAudioElement(el: HTMLMediaElement): boolean {
  return internalAudioElements.has(el) || el.dataset?.upgradeInternal === 'true';
}

export function isInternalTimerAudioActive(): boolean {
  return isCountdownArmed || alarmLoopIntervalId !== null;
}

const TRACK_SAMPLE_RATE = 8000;
const CHIME_CYCLE_SEC = 1.5;
const CHIME_CYCLE_SAMPLES = Math.floor(TRACK_SAMPLE_RATE * CHIME_CYCLE_SEC); // 12,000 muestras
const ALARM_TAIL_CYCLES = 30; // 45 segundos continuos de alarma potente integrada en la pista
const MAX_PREBAKED_COUNTDOWN_SEC = 1800; // Hasta 30 min pre-renderizados en memoria

let cachedPilotOneSecInt16: Int16Array | null = null;
let cachedAlarmCycleInt16: Int16Array | null = null;

function configureAudioSessionMode(mode: 'ambient' | 'playback'): void {
  if (typeof navigator === 'undefined') return;
  try {
    const navWithAudioSession = navigator as Navigator & {
      audioSession?: { type: string };
    };
    if (!navWithAudioSession.audioSession) return;
    if (navWithAudioSession.audioSession.type !== mode) {
      navWithAudioSession.audioSession.type = mode;
    }
  } catch {
    // Ignorar en navegadores sin navigator.audioSession
  }
}

function updateMediaSessionForTimer(active: boolean, title?: string, onStop?: () => void): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (!active) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      return;
    }
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Temporizador · Upgrade',
        artist: 'Upgrade',
      });
    }
    navigator.mediaSession.playbackState = 'playing';
    if (onStop) {
      navigator.mediaSession.setActionHandler('pause', onStop);
      navigator.mediaSession.setActionHandler('stop', onStop);
    }
  } catch {
    // Ignorar restricciones de MediaSession
  }
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  configureAudioSessionMode(
    isCountdownArmed || alarmLoopIntervalId !== null ? 'playback' : 'ambient'
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
    updateMediaSessionForTimer(false);
    if (sharedAudioContext && sharedAudioContext.state === 'running') {
      void sharedAudioContext.suspend().catch(() => {});
    }
  }, delayMs);
}

/** Plantilla de 1 segundo con señal piloto inaudible (-80 dBFS) para evitar corte por detector de silencio del SO. */
function getPilotOneSecTemplate(): Int16Array {
  if (cachedPilotOneSecInt16) return cachedPilotOneSecInt16;
  const arr = new Int16Array(TRACK_SAMPLE_RATE);
  for (let i = 0; i < TRACK_SAMPLE_RATE; i += 1) {
    // Onda suave de 25 Hz a ±3 LSB sobre 32767 (-80.7 dBFS: inaudible al oído, no-cero para el DAC móvil)
    arr[i] = (i % 320) < 160 ? 3 : -3;
  }
  cachedPilotOneSecInt16 = arr;
  return arr;
}

/** Plantilla de 1.5 segundos con el patrón de alarma rico en armónicos a alto volumen para altavoz móvil. */
function getAlarmCycleTemplate(): Int16Array {
  if (cachedAlarmCycleInt16) return cachedAlarmCycleInt16;
  const arr = new Int16Array(CHIME_CYCLE_SAMPLES);

  // Patrón rítmico urgente de alarma deportiva (4 pulsos brillantes + armónicos de presencia en 1.7–2.6 kHz)
  const notes = [
    { freq: 880, start: 0.0, dur: 0.16 },
    { freq: 1046.5, start: 0.2, dur: 0.16 },
    { freq: 880, start: 0.4, dur: 0.16 },
    { freq: 1318.5, start: 0.6, dur: 0.36 },
  ];

  for (const n of notes) {
    const startIdx = Math.floor(n.start * TRACK_SAMPLE_RATE);
    const len = Math.floor(n.dur * TRACK_SAMPLE_RATE);
    for (let i = 0; i < len && startIdx + i < CHIME_CYCLE_SAMPLES; i += 1) {
      const t = i / TRACK_SAMPLE_RATE;
      const attack = t < 0.012 ? t / 0.012 : 1;
      const decay =
        t < n.dur * 0.72
          ? 1
          : Math.max(0, 1 - (t - n.dur * 0.72) / (n.dur * 0.28));
      const env = attack * decay;

      const f1 = Math.sin(2 * Math.PI * n.freq * t);
      const f2 = Math.sin(2 * Math.PI * (n.freq * 2) * t) * 0.42;
      const f3 = Math.sin(2 * Math.PI * (n.freq * 3) * t) * 0.18;
      // Compresión suave para sonar alto y claro en el altavoz del teléfono
      const raw = (f1 + f2 + f3) * 0.72 * env;
      const saturated = Math.tanh(raw * 1.45) * 0.94;
      const mixed = arr[startIdx + i] / 32767 + saturated;
      const clamped = Math.max(-0.98, Math.min(0.98, mixed));
      arr[startIdx + i] = Math.round(clamped * 32767);
    }
  }

  cachedAlarmCycleInt16 = arr;
  return arr;
}

function writeWavHeader(view: DataView, numSamples: number, sampleRate: number): void {
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  const byteSize = numSamples * 2;
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + byteSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM lineal
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, byteSize, true);
}

/**
 * Construye instantáneamente (< 2 ms) un WAV continuo con `waitMs` de piloto inaudible
 * seguidos de 45 segundos (30 ciclos) de alarma sonora potente.
 */
function buildCountdownPlusAlarmWavUrl(waitMs: number): string | null {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined') return null;

  const clampedWaitSec = Math.max(0.05, Math.min(MAX_PREBAKED_COUNTDOWN_SEC, waitMs / 1000));
  const waitSamples = Math.round(clampedWaitSec * TRACK_SAMPLE_RATE);
  const alarmSamples = CHIME_CYCLE_SAMPLES * ALARM_TAIL_CYCLES;
  const totalSamples = waitSamples + alarmSamples;

  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);
  writeWavHeader(view, totalSamples, TRACK_SAMPLE_RATE);

  const pcm = new Int16Array(buffer, 44, totalSamples);
  const pilotSec = getPilotOneSecTemplate();
  const fullSecs = Math.floor(waitSamples / TRACK_SAMPLE_RATE);
  let cursor = 0;
  for (let s = 0; s < fullSecs; s += 1) {
    pcm.set(pilotSec, cursor);
    cursor += TRACK_SAMPLE_RATE;
  }
  const remWait = waitSamples - cursor;
  if (remWait > 0) {
    pcm.set(pilotSec.subarray(0, remWait), cursor);
    cursor += remWait;
  }

  const alarmCycle = getAlarmCycleTemplate();
  for (let c = 0; c < ALARM_TAIL_CYCLES; c += 1) {
    pcm.set(alarmCycle, cursor);
    cursor += CHIME_CYCLE_SAMPLES;
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

/** Pista de bucle continuo de 6 segundos (>= 5s para foco multimedia real en móvil) con 4 ciclos de alarma. */
function getOrCreateAlarmLoopAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return null;
  }
  if (!alarmLoopTrackBlobUrl) {
    const cycles = 4; // 4 * 1.5s = 6.0 segundos (>= 5s umbral de Android Chrome)
    const totalSamples = CHIME_CYCLE_SAMPLES * cycles;
    const buffer = new ArrayBuffer(44 + totalSamples * 2);
    writeWavHeader(new DataView(buffer), totalSamples, TRACK_SAMPLE_RATE);
    const pcm = new Int16Array(buffer, 44, totalSamples);
    const cycle = getAlarmCycleTemplate();
    for (let c = 0; c < cycles; c += 1) {
      pcm.set(cycle, c * CHIME_CYCLE_SAMPLES);
    }
    alarmLoopTrackBlobUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  if (!alarmLoopTrackAudio) {
    const el = new Audio(alarmLoopTrackBlobUrl);
    el.loop = true;
    el.volume = 1.0;
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    el.dataset.upgradeInternal = 'true';
    internalAudioElements.add(el);
    alarmLoopTrackAudio = el;
  }
  return alarmLoopTrackAudio;
}

function stopCountdownTrackAudio(): void {
  if (countdownTrackAudio) {
    try {
      countdownTrackAudio.onended = null;
      countdownTrackAudio.pause();
      countdownTrackAudio.removeAttribute('src');
      countdownTrackAudio.load();
    } catch {
      // Ignorar
    }
  }
  if (countdownTrackBlobUrl && typeof URL !== 'undefined') {
    try {
      URL.revokeObjectURL(countdownTrackBlobUrl);
    } catch {
      // Ignorar
    }
    countdownTrackBlobUrl = null;
  }
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
  stopBtn?: string;
}

/**
 * Arma y reproduce inmediatamente (dentro del toque del usuario) la pista continua de cuenta atrás + alarma:
 * - Funciona fuera de la app (en WhatsApp, Instagram, etc.) y con la pantalla apagada porque el `<audio>`
 *   de sesión `'playback'` ya está reproduciéndose desde el clic del usuario y contiene las muestras
 *   de la alarma en el instante exacto `durationMs`.
 */
export function armCountdownBackgroundAudio(
  durationMs: number,
  routineTitle?: string,
  copy?: AlarmNotificationCopy,
  notificationsEnabled = true
): void {
  stopCountdownTrackAudio();
  cancelScheduledSuspend();
  isCountdownArmed = true;
  configureAudioSessionMode('playback');

  try {
    const wavUrl = buildCountdownPlusAlarmWavUrl(durationMs);
    if (wavUrl && typeof Audio !== 'undefined') {
      countdownTrackBlobUrl = wavUrl;
      if (!countdownTrackAudio) {
        countdownTrackAudio = new Audio();
        countdownTrackAudio.setAttribute('playsinline', 'true');
        countdownTrackAudio.dataset.upgradeInternal = 'true';
        internalAudioElements.add(countdownTrackAudio);
      }
      countdownTrackAudio.src = wavUrl;
      countdownTrackAudio.loop = false;
      countdownTrackAudio.muted = false;
      countdownTrackAudio.volume = 1.0;

      // Si tras los 45 s de alarma integrada aún no se ha parado, encadenar el bucle de alarma
      countdownTrackAudio.onended = () => {
        if (isCountdownArmed || alarmLoopIntervalId !== null) {
          const loopEl = getOrCreateAlarmLoopAudio();
          if (loopEl) {
            loopEl.muted = false;
            loopEl.volume = 1.0;
            loopEl.currentTime = 0;
            void loopEl.play().catch(() => {});
          }
        }
      };

      void countdownTrackAudio.play().catch(() => {});
    }

    // Pre-desbloquear también el reproductor de bucle en el mismo gesto táctil
    const loopEl = getOrCreateAlarmLoopAudio();
    if (loopEl && loopEl.paused) {
      loopEl.muted = true;
      void loopEl
        .play()
        .then(() => {
          if (alarmLoopIntervalId === null) {
            loopEl.pause();
            loopEl.currentTime = 0;
          }
          loopEl.muted = false;
        })
        .catch(() => {
          loopEl.muted = false;
        });
    }
  } catch {
    // Ignorar restricciones de HTMLAudioElement
  }

  try {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {
    // Ignorar restricciones de WebAudio
  }

  updateMediaSessionForTimer(true, routineTitle ? `${routineTitle} · Upgrade` : undefined);

  // Programar además los pulsos de alarma/vibración en el Service Worker (si el usuario dio permiso)
  if (
    notificationsEnabled &&
    isNotificationSupported() &&
    Notification.permission === 'granted'
  ) {
    const notificationTitle = copy?.title || 'Temporizador finalizado';
    const tapToStop = copy?.tapToStop || 'Pulsa para parar la alarma';
    const restDone = copy?.restDone || 'Tiempo de descanso completado';
    const stopLabel = copy?.stopBtn || 'Parar';
    const notificationBody = routineTitle ? `${routineTitle} · ${tapToStop}` : restDone;

    postMessageToServiceWorker({
      type: 'SCHEDULE_TIMER_ALARM',
      endMs: Date.now() + Math.max(0, Math.round(durationMs)),
      title: notificationTitle,
      body: notificationBody,
      stopLabel,
    });
  }
}

/** Cancela cualquier alarma pre-programada al pausar, reiniciar o editar el temporizador. */
export function disarmCountdownBackgroundAudio(): void {
  isCountdownArmed = false;
  stopCountdownTrackAudio();
  postMessageToServiceWorker({ type: 'CANCEL_TIMER_ALARM' });

  if (alarmLoopIntervalId === null) {
    updateMediaSessionForTimer(false);
    scheduleAudioSuspendWhenIdle(100);
  }
}

/** Compatibilidad directa para desbloquear el contexto sin pedir permisos invasivos. */
export function prepareCountdownAudio(): void {
  configureAudioSessionMode('playback');
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {
    // Ignorar restricciones de reproducción automática
  }
}

/** Si una alarma sigue activa al desbloquear o volver a la app, asegura que siga sonando. */
export function resumeAlarmAudioIfNeeded(): void {
  if (alarmLoopIntervalId === null && !isCountdownArmed) return;
  try {
    configureAudioSessionMode('playback');
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => {});
    }
    if (alarmLoopIntervalId !== null) {
      const isTrackAlreadyRinging =
        countdownTrackAudio !== null && !countdownTrackAudio.paused && !countdownTrackAudio.ended;
      if (!isTrackAlreadyRinging) {
        const loopEl = getOrCreateAlarmLoopAudio();
        if (loopEl && loopEl.paused) {
          loopEl.muted = false;
          loopEl.volume = 1.0;
          void loopEl.play().catch(() => {});
        }
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

/** Ráfaga de ki retro 8-bits al acariciar a Bug en modo Super Saiyajin (Nivel 90+). */
export function playBugSuperSaiyanSound(): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    cancelScheduledSuspend();
    activeSoundEffectsCount += 1;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.55, now);
    master.connect(ctx.destination);

    // Barrido ascendente de energía dorada + pulsos eléctricos 8-bits
    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(165, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(660, now + 0.32);
    sweepOsc.frequency.exponentialRampToValueAtTime(880, now + 0.65);
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.linearRampToValueAtTime(0.09, now + 0.04);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(master);
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.75);

    const sparkNotes = [587.33, 880, 1174.66, 1318.5, 1760];
    sparkNotes.forEach((freq, idx) => {
      const t0 = now + 0.08 + idx * 0.095;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.065, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.09);
    });

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
        try {
          master.disconnect();
        } catch {
          // Ignorar errores de desconexión
        }
        scheduleAudioSuspendWhenIdle(120);
      }, 860);
    } else {
      activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
    }
  } catch {
    activeSoundEffectsCount = Math.max(0, activeSoundEffectsCount - 1);
    scheduleAudioSuspendWhenIdle(120);
  }
}

function playAlarmChimeWebAudioOnce(playSound = true): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([320, 120, 320]);
    }
    if (!playSound) return;

    configureAudioSessionMode('playback');
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    cancelScheduledSuspend();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const notesHz = [880, 1046.5, 880, 1318.5];
    const offsetsSec = [0, 0.2, 0.4, 0.6];
    const durationsSec = [0.16, 0.16, 0.16, 0.34];

    notesHz.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offsetsSec[idx]);

      gain.gain.setValueAtTime(0.001, now + offsetsSec[idx]);
      gain.gain.exponentialRampToValueAtTime(0.45, now + offsetsSec[idx] + 0.015);
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
  cancelScheduledSuspend();
  configureAudioSessionMode('playback');

  // IMPORTANTE: Si la pista continua iniciada en el toque del usuario ya está sonando (especialmente fuera de la app
  // o con pantalla apagada), NO pausarla para no perder el canal de audio activo del sistema operativo.
  const isPrebakedTrackRinging =
    countdownTrackAudio !== null && !countdownTrackAudio.paused && !countdownTrackAudio.ended;

  if (!isPrebakedTrackRinging) {
    stopCountdownTrackAudio();
    const loopEl = getOrCreateAlarmLoopAudio();
    if (loopEl) {
      loopEl.muted = false;
      loopEl.volume = 1.0;
      loopEl.currentTime = 0;
      void loopEl.play().catch(() => {});
    }
    playAlarmChimeWebAudioOnce(true);
  } else {
    playAlarmChimeWebAudioOnce(false);
  }

  if (typeof window !== 'undefined') {
    alarmLoopIntervalId = window.setInterval(() => {
      const stillPlayingHtmlTrack =
        (countdownTrackAudio !== null &&
          !countdownTrackAudio.paused &&
          !countdownTrackAudio.ended) ||
        (alarmLoopTrackAudio !== null && !alarmLoopTrackAudio.paused);
      playAlarmChimeWebAudioOnce(!stillPlayingHtmlTrack);
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
              vibrate: [420, 140, 420, 140, 620],
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
  stopCountdownTrackAudio();

  if (alarmLoopIntervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(alarmLoopIntervalId);
    alarmLoopIntervalId = null;
  }

  if (alarmLoopTrackAudio && !alarmLoopTrackAudio.paused) {
    try {
      alarmLoopTrackAudio.pause();
      alarmLoopTrackAudio.currentTime = 0;
    } catch {
      // Ignorar
    }
  }

  updateMediaSessionForTimer(false);
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
