/**
 * Detección de reproducción multimedia para la reacción de baile de Bug:
 * - Detecta elementos `<audio>` y `<video>` activos en el documento o creados en memoria
 *   (excluyendo las pistas internas del temporizador/alarma de Upgrade).
 * - Consulta `navigator.mediaSession` y puentes nativos del sistema móvil (`AudioManager.isMusicActive`,
 *   `MediaPlaybackBridge` o plugins de sesión multimedia) cuando están disponibles.
 * - Respeta el modo elegido por el usuario en Personalizar Bug (`auto` | `on` | `off`).
 */

import { useEffect, useState } from 'react';
import { BugMusicMode } from '../types';
import {
  isInternalAppAudioElement,
  isInternalTimerAudioActive,
} from '../utils/audioEffects';

interface NativeMediaPlaybackBridge {
  isMusicActive?: () => boolean | Promise<boolean>;
  isPlaying?: () => boolean | Promise<boolean>;
  addListener?: (
    eventName: string,
    cb: (state: { playing?: boolean; isPlaying?: boolean }) => void
  ) => { remove?: () => void } | void;
}

function getNativeMediaBridge(): NativeMediaPlaybackBridge | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AndroidMediaBridge?: NativeMediaPlaybackBridge;
    MediaPlaybackBridge?: NativeMediaPlaybackBridge;
    Capacitor?: {
      Plugins?: {
        MediaSession?: NativeMediaPlaybackBridge;
        MediaPlayback?: NativeMediaPlaybackBridge;
      };
    };
  };
  return (
    win.AndroidMediaBridge ||
    win.MediaPlaybackBridge ||
    win.Capacitor?.Plugins?.MediaPlayback ||
    win.Capacitor?.Plugins?.MediaSession ||
    null
  );
}

const trackedMediaElements = new Set<HTMLMediaElement>();
const mediaStateSubscribers = new Set<() => void>();
let isPrototypePatched = false;

function notifyMediaSubscribers(): void {
  mediaStateSubscribers.forEach((cb) => cb());
}

function bindMediaElementEvents(el: HTMLMediaElement): void {
  if (isInternalAppAudioElement(el) || trackedMediaElements.has(el)) return;
  trackedMediaElements.add(el);
  const onState = () => notifyMediaSubscribers();
  el.addEventListener('playing', onState);
  el.addEventListener('play', onState);
  el.addEventListener('pause', onState);
  el.addEventListener('ended', onState);
  el.addEventListener('emptied', onState);
  el.addEventListener('volumechange', onState);
}

function ensureMediaPrototypePatched(): void {
  if (isPrototypePatched || typeof window === 'undefined' || typeof HTMLMediaElement === 'undefined') {
    return;
  }
  isPrototypePatched = true;
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function patchedMediaPlay(
    this: HTMLMediaElement
  ): Promise<void> {
    if (!isInternalAppAudioElement(this)) {
      bindMediaElementEvents(this);
      window.setTimeout(notifyMediaSubscribers, 20);
    }
    return originalPlay.call(this);
  };
}

function isAnyExternalDomMediaPlaying(): boolean {
  if (typeof document !== 'undefined') {
    const domNodes = document.querySelectorAll('audio, video');
    domNodes.forEach((node) => {
      if (node instanceof HTMLMediaElement && !isInternalAppAudioElement(node)) {
        trackedMediaElements.add(node);
      }
    });
  }

  for (const el of Array.from(trackedMediaElements)) {
    if (isInternalAppAudioElement(el)) {
      trackedMediaElements.delete(el);
      continue;
    }
    if (!el.paused && !el.ended && !el.muted && el.volume > 0 && el.readyState >= 2) {
      return true;
    }
  }
  return false;
}

function isExternalMediaSessionPlaying(): boolean {
  if (typeof navigator === 'undefined') return false;

  try {
    if ('mediaSession' in navigator && navigator.mediaSession) {
      if (
        navigator.mediaSession.playbackState === 'playing' &&
        !isInternalTimerAudioActive() &&
        navigator.mediaSession.metadata?.artist !== 'Upgrade'
      ) {
        return true;
      }
    }
  } catch {
    // Ignorar restricciones de MediaSession
  }

  try {
    const navAudioSession = (
      navigator as Navigator & {
        audioSession?: { state?: string; isOtherAudioPlaying?: boolean };
      }
    ).audioSession;
    if (navAudioSession?.isOtherAudioPlaying === true) {
      return true;
    }
  } catch {
    // Ignorar en navegadores sin extensión audioSession
  }

  return false;
}

export function useMediaPlaybackDetection(mode: BugMusicMode = 'auto'): boolean {
  const [detectedPlaying, setDetectedPlaying] = useState<boolean>(false);

  useEffect(() => {
    if (mode === 'off') {
      setDetectedPlaying(false);
      return;
    }
    if (mode === 'on') {
      setDetectedPlaying(true);
      return;
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    ensureMediaPrototypePatched();
    let disposed = false;
    let externalEventPlaying = false;

    const evaluateNow = async () => {
      if (disposed) return;

      let active =
        externalEventPlaying ||
        isAnyExternalDomMediaPlaying() ||
        isExternalMediaSessionPlaying();

      if (!active) {
        const bridge = getNativeMediaBridge();
        const checkFn = bridge?.isMusicActive || bridge?.isPlaying;
        if (bridge && typeof checkFn === 'function') {
          try {
            const res = await checkFn.call(bridge);
            if (!disposed && res === true) {
              active = true;
            }
          } catch {
            // Ignorar errores del puente nativo
          }
        }
      }

      if (!disposed) {
        setDetectedPlaying((prev) => (prev === active ? prev : active));
      }
    };

    const syncSync = () => {
      void evaluateNow();
    };

    const handleCaptureMediaEvent = (e: Event) => {
      if (e.target instanceof HTMLMediaElement && !isInternalAppAudioElement(e.target)) {
        bindMediaElementEvents(e.target);
        syncSync();
      }
    };

    const handleCustomBridgeEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ playing?: boolean; isPlaying?: boolean }>).detail;
      if (detail && typeof detail === 'object') {
        const nextVal = detail.playing ?? detail.isPlaying;
        if (typeof nextVal === 'boolean') {
          externalEventPlaying = nextVal;
          syncSync();
        }
      }
    };

    mediaStateSubscribers.add(syncSync);
    document.addEventListener('play', handleCaptureMediaEvent, true);
    document.addEventListener('playing', handleCaptureMediaEvent, true);
    document.addEventListener('pause', handleCaptureMediaEvent, true);
    document.addEventListener('ended', handleCaptureMediaEvent, true);
    document.addEventListener('volumechange', handleCaptureMediaEvent, true);
    document.addEventListener('visibilitychange', syncSync);
    window.addEventListener('focus', syncSync);
    window.addEventListener('mediaplaybackchange', handleCustomBridgeEvent);
    window.addEventListener('nativeMediaPlaybackChange', handleCustomBridgeEvent);

    const bridge = getNativeMediaBridge();
    const nativeSub = bridge?.addListener?.('mediaPlaybackChange', (state) => {
      const flag = state?.playing ?? state?.isPlaying;
      if (typeof flag === 'boolean') {
        externalEventPlaying = flag;
        syncSync();
      }
    });

    void evaluateNow();
    const pollId = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void evaluateNow();
      }
    }, 1800);

    return () => {
      disposed = true;
      mediaStateSubscribers.delete(syncSync);
      window.clearInterval(pollId);
      document.removeEventListener('play', handleCaptureMediaEvent, true);
      document.removeEventListener('playing', handleCaptureMediaEvent, true);
      document.removeEventListener('pause', handleCaptureMediaEvent, true);
      document.removeEventListener('ended', handleCaptureMediaEvent, true);
      document.removeEventListener('volumechange', handleCaptureMediaEvent, true);
      document.removeEventListener('visibilitychange', syncSync);
      window.removeEventListener('focus', syncSync);
      window.removeEventListener('mediaplaybackchange', handleCustomBridgeEvent);
      window.removeEventListener('nativeMediaPlaybackChange', handleCustomBridgeEvent);
      if (nativeSub && typeof nativeSub === 'object' && typeof nativeSub.remove === 'function') {
        try {
          nativeSub.remove();
        } catch {
          // Ignorar
        }
      }
    };
  }, [mode]);

  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return detectedPlaying;
}
