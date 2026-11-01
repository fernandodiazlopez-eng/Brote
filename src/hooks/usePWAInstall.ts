/**
 * Hook para gestionar la instalación nativa de la PWA (Android, Chrome, Edge, Desktop)
 * y detectar Safari en iOS/iPadOS o ejecución ya instalada en modo standalone.
 */

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => cachedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const checkStandalone = () => {
      const standalone =
        standaloneQuery.matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };

    checkStandalone();

    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleTouchMac =
      ua.includes('macintosh') &&
      typeof navigator.maxTouchPoints === 'number' &&
      navigator.maxTouchPoints > 1;
    setIsIOS(/iphone|ipad|ipod/.test(ua) || isAppleTouchMac);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      cachedDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      cachedDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneQuery.addEventListener?.('change', checkStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneQuery.removeEventListener?.('change', checkStandalone);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const promptEvent = deferredPrompt || cachedDeferredPrompt;
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        cachedDeferredPrompt = null;
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch {
      // Ignorar si el navegador cancela el diálogo
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}
