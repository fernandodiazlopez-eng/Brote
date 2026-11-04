/**
 * Detección de reproducción multimedia para la reacción de baile de Bug:
 * - Si el usuario vincula su cuenta de Spotify (OAuth 2.0), consulta en tiempo real si Spotify
 *   está reproduciendo música en el móvil, auriculares, ordenador o altavoz.
 * - Detecta también elementos `<audio>` y `<video>` externos dentro del navegador y puentes nativos.
 * - Respeta el modo elegido por el usuario en Personalizar Bug (`auto` | `on` | `off`).
 */

import { useEffect, useState } from 'react';
import { BugMusicMode } from '../types';
import {
  isInternalAppAudioElement,
  isInternalTimerAudioActive,
} from '../utils/audioEffects';
import {
  fetchSpotifyCurrentlyPlaying,
  loadSpotifyTokens,
  subscribeSpotifyTokensChange,
} from '../utils/spotifyAuth';

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
    let spotifyPlaying = false;
    let lastSpotifyCheckMs = 0;
    let spotifyCheckInFlight = false;

    const evaluateNow = async (forceSpotifyCheck = false) => {
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

      const hasSpotify = Boolean(loadSpotifyTokens());
      if (!hasSpotify) {
        spotifyPlaying = false;
      } else if (!active && document.visibilityState !== 'hidden') {
        const now = Date.now();
        if ((forceSpotifyCheck || now - lastSpotifyCheckMs >= 4800) && !spotifyCheckInFlight) {
          spotifyCheckInFlight = true;
          lastSpotifyCheckMs = now;
          try {
            spotifyPlaying = await fetchSpotifyCurrentlyPlaying();
          } finally {
            spotifyCheckInFlight = false;
          }
        }
        if (spotifyPlaying) {
          active = true;
        }
      }

      if (!disposed) {
        setDetectedPlaying((prev) => (prev === active ? prev : active));
      }
    };

    const syncFast = () => {
      void evaluateNow(false);
    };

    const syncWithSpotify = () => {
      void evaluateNow(true);
    };

    const handleCaptureMediaEvent = (e: Event) => {
      if (e.target instanceof HTMLMediaElement && !isInternalAppAudioElement(e.target)) {
        bindMediaElementEvents(e.target);
        syncFast();
      }
    };

    const handleCustomBridgeEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ playing?: boolean; isPlaying?: boolean }>).detail;
      if (detail && typeof detail === 'object') {
        const nextVal = detail.playing ?? detail.isPlaying;
        if (typeof nextVal === 'boolean') {
          externalEventPlaying = nextVal;
          syncFast();
        }
      }
    };

    const unsubSpotify = subscribeSpotifyTokensChange(syncWithSpotify);
    mediaStateSubscribers.add(syncFast);
    document.addEventListener('play', handleCaptureMediaEvent, true);
    document.addEventListener('playing', handleCaptureMediaEvent, true);
    document.addEventListener('pause', handleCaptureMediaEvent, true);
    document.addEventListener('ended', handleCaptureMediaEvent, true);
    document.addEventListener('volumechange', handleCaptureMediaEvent, true);
    document.addEventListener('visibilitychange', syncWithSpotify);
    window.addEventListener('focus', syncWithSpotify);
    window.addEventListener('mediaplaybackchange', handleCustomBridgeEvent);
    window.addEventListener('nativeMediaPlaybackChange', handleCustomBridgeEvent);

    const bridge = getNativeMediaBridge();
    const nativeSub = bridge?.addListener?.('mediaPlaybackChange', (state) => {
      const flag = state?.playing ?? state?.isPlaying;
      if (typeof flag === 'boolean') {
        externalEventPlaying = flag;
        syncFast();
      }
    });

    void evaluateNow(true);
    const pollId = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void evaluateNow(false);
      }
    }, 2000);

    return () => {
      disposed = true;
      unsubSpotify();
      mediaStateSubscribers.delete(syncFast);
      window.clearInterval(pollId);
      document.removeEventListener('play', handleCaptureMediaEvent, true);
      document.removeEventListener('playing', handleCaptureMediaEvent, true);
      document.removeEventListener('pause', handleCaptureMediaEvent, true);
      document.removeEventListener('ended', handleCaptureMediaEvent, true);
      document.removeEventListener('volumechange', handleCaptureMediaEvent, true);
      document.removeEventListener('visibilitychange', syncWithSpotify);
      window.removeEventListener('focus', syncWithSpotify);
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
