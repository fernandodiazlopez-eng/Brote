/**
 * Cliente OAuth y consulta de reproducción en vivo de Spotify:
 * - Permite que Bug detecte si el usuario está escuchando música en la app nativa de Spotify
 *   (móvil, auriculares, ordenador o altavoz), superando el aislamiento de audio del navegador móvil.
 * - Usa ventana emergente hacia el proveedor (`accounts.spotify.com`) compatible con iframe y PWA móvil.
 */

export interface SpotifyStoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export const SPOTIFY_TOKENS_STORAGE_KEY = 'upgrade_spotify_tokens_v1';
const SPOTIFY_AUTH_CHANGE_EVENT = 'upgrade-spotify-auth-change';

export function loadSpotifyTokens(): SpotifyStoredTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SPOTIFY_TOKENS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifyStoredTokens>;
    if (typeof parsed.accessToken !== 'string' || !parsed.accessToken) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveSpotifyTokens(tokens: SpotifyStoredTokens): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SPOTIFY_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    window.dispatchEvent(new Event(SPOTIFY_AUTH_CHANGE_EVENT));
  } catch {
    // Ignorar límites de almacenamiento
  }
}

export function clearSpotifyTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SPOTIFY_TOKENS_STORAGE_KEY);
    window.dispatchEvent(new Event(SPOTIFY_AUTH_CHANGE_EVENT));
  } catch {
    // Ignorar errores de almacenamiento
  }
}

export function subscribeSpotifyTokensChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === SPOTIFY_TOKENS_STORAGE_KEY) {
      listener();
    }
  };

  const handleMessage = (event: MessageEvent) => {
    const origin = event.origin || '';
    if (
      origin &&
      !origin.endsWith('.run.app') &&
      !origin.includes('localhost') &&
      !origin.includes('127.0.0.1')
    ) {
      return;
    }
    const data = event.data as
      | { type?: string; tokens?: SpotifyStoredTokens }
      | undefined;
    if (data?.type === 'OAUTH_SPOTIFY_SUCCESS' && data.tokens?.accessToken) {
      saveSpotifyTokens(data.tokens);
    }
  };

  window.addEventListener(SPOTIFY_AUTH_CHANGE_EVENT, listener);
  window.addEventListener('storage', handleStorage);
  window.addEventListener('message', handleMessage);

  return () => {
    window.removeEventListener(SPOTIFY_AUTH_CHANGE_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('message', handleMessage);
  };
}

export async function checkSpotifyServerConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/api/spotify/status');
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

export async function startSpotifyOAuthFlow(): Promise<
  'opened' | 'missing_config' | 'popup_blocked' | 'error'
> {
  if (typeof window === 'undefined') return 'error';
  try {
    const origin = encodeURIComponent(window.location.origin);
    const res = await fetch(`/api/spotify/auth-url?origin=${origin}`);
    if (!res.ok) {
      if (res.status === 400) return 'missing_config';
      return 'error';
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) return 'error';

    const isEmbeddedIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    const popup = window.open(data.url, 'spotify_oauth_popup', 'width=520,height=720');
    if (!popup) {
      if (!isEmbeddedIframe) {
        window.location.assign(data.url);
        return 'opened';
      }
      return 'popup_blocked';
    }
    return 'opened';
  } catch {
    return 'error';
  }
}

export async function fetchSpotifyCurrentlyPlaying(): Promise<boolean> {
  const tokens = loadSpotifyTokens();
  if (!tokens) return false;

  try {
    const res = await fetch('/api/spotify/currently-playing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens),
    });

    if (res.status === 401) {
      clearSpotifyTokens();
      return false;
    }

    if (!res.ok) return false;

    const data = (await res.json()) as {
      isPlaying?: boolean;
      refreshedTokens?: SpotifyStoredTokens;
    };

    if (data.refreshedTokens?.accessToken) {
      saveSpotifyTokens(data.refreshedTokens);
    }

    return Boolean(data.isPlaying);
  } catch {
    return false;
  }
}
