import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_CURRENTLY_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';

interface OAuthStatePayload {
  r: string;
  v: string;
}

interface SpotifyTokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function getSpotifyCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: (process.env.SPOTIFY_CLIENT_ID || '').trim(),
    clientSecret: (process.env.SPOTIFY_CLIENT_SECRET || '').trim(),
  };
}

function isAllowedOrigin(rawOrigin: string): boolean {
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.run.app');
  } catch {
    return false;
  }
}

function resolveCallbackRedirectUri(req: Request): string {
  const queryOrigin = typeof req.query.origin === 'string' ? req.query.origin.trim() : '';
  if (queryOrigin && isAllowedOrigin(queryOrigin)) {
    return `${queryOrigin.replace(/\/+$/, '')}/auth/spotify/callback`;
  }
  const envAppUrl = (process.env.APP_URL || '').trim();
  if (envAppUrl && isAllowedOrigin(envAppUrl)) {
    return `${envAppUrl.replace(/\/+$/, '')}/auth/spotify/callback`;
  }
  return `http://localhost:${PORT}/auth/spotify/callback`;
}

function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function encodeState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeState(rawState: string): OAuthStatePayload | null {
  try {
    const json = Buffer.from(rawState, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<OAuthStatePayload>;
    if (typeof parsed.r === 'string' && typeof parsed.v === 'string') {
      return { r: parsed.r, v: parsed.v };
    }
    return null;
  } catch {
    return null;
  }
}

async function refreshSpotifyAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<SpotifyTokenBundle | null> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    params.set('client_id', clientId);
  }

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + Math.max(60, data.expires_in || 3600) * 1000,
  };
}

function renderOAuthCallbackHtml(tokens: SpotifyTokenBundle | null, errorMsg?: string): string {
  const safePayload = JSON.stringify(
    tokens
      ? { type: 'OAUTH_SPOTIFY_SUCCESS', tokens }
      : { type: 'OAUTH_SPOTIFY_ERROR', error: errorMsg || 'auth_failed' }
  ).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Spotify · Upgrade</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #08080a;
        color: #f4f4f6;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 24px;
        text-align: center;
      }
      .box {
        border: 1px solid #27272a;
        border-radius: 6px;
        padding: 20px 24px;
        max-width: 340px;
      }
      p { margin: 0; font-size: 14px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="box">
      <p>${
        tokens
          ? 'Spotify conectado correctamente. Cerrando ventana...'
          : 'No se pudo completar la conexión con Spotify.'
      }</p>
    </div>
    <script>
      (function () {
        var payload = ${safePayload};
        try {
          if (payload.tokens) {
            localStorage.setItem('upgrade_spotify_tokens_v1', JSON.stringify(payload.tokens));
          }
        } catch (e) {}
        if (window.opener && !window.opener.closed) {
          try {
            window.opener.postMessage(payload, '*');
          } catch (e) {}
          window.close();
          setTimeout(function () {
            window.location.replace('/');
          }, 900);
        } else {
          window.location.replace('/');
        }
      })();
    </script>
  </body>
</html>`;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/spotify/status', (_req: Request, res: Response) => {
    const { clientId } = getSpotifyCredentials();
    res.json({ configured: Boolean(clientId) });
  });

  app.get('/api/spotify/auth-url', (req: Request, res: Response) => {
    const { clientId, clientSecret } = getSpotifyCredentials();
    if (!clientId) {
      res.status(400).json({ error: 'missing_spotify_client_id' });
      return;
    }

    const redirectUri = resolveCallbackRedirectUri(req);
    const { verifier, challenge } = createPkcePair();
    const state = encodeState({ r: redirectUri, v: verifier });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES,
      state,
    });

    if (!clientSecret) {
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', challenge);
    }

    res.json({
      url: `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`,
      redirectUri,
    });
  });

  const handleSpotifyCallback = async (req: Request, res: Response): Promise<void> => {
    const { clientId, clientSecret } = getSpotifyCredentials();
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const rawState = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthErr = typeof req.query.error === 'string' ? req.query.error : '';

    if (oauthErr || !code || !clientId) {
      res.status(200).send(renderOAuthCallbackHtml(null, oauthErr || 'missing_code'));
      return;
    }

    const decoded = decodeState(rawState);
    const redirectUri = decoded?.r || resolveCallbackRedirectUri(req);

    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if (clientSecret) {
        headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString(
          'base64'
        )}`;
      } else {
        params.set('client_id', clientId);
        if (decoded?.v) {
          params.set('code_verifier', decoded.v);
        }
      }

      const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers,
        body: params.toString(),
      });

      if (!tokenRes.ok) {
        res.status(200).send(renderOAuthCallbackHtml(null, 'token_exchange_failed'));
        return;
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      if (!tokenData.access_token) {
        res.status(200).send(renderOAuthCallbackHtml(null, 'empty_access_token'));
        return;
      }

      const bundle: SpotifyTokenBundle = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
        expiresAt: Date.now() + Math.max(60, tokenData.expires_in || 3600) * 1000,
      };

      res.status(200).send(renderOAuthCallbackHtml(bundle));
    } catch {
      res.status(200).send(renderOAuthCallbackHtml(null, 'network_error'));
    }
  };

  app.get(['/auth/spotify/callback', '/auth/spotify/callback/'], (req, res) => {
    void handleSpotifyCallback(req, res);
  });

  app.post('/api/spotify/currently-playing', async (req: Request, res: Response) => {
    const { clientId, clientSecret } = getSpotifyCredentials();
    const body = (req.body || {}) as Partial<SpotifyTokenBundle>;
    let accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';
    const expiresAt = typeof body.expiresAt === 'number' ? body.expiresAt : 0;

    if (!accessToken && !refreshToken) {
      res.status(401).json({ isPlaying: false, disconnected: true });
      return;
    }

    let refreshedTokens: SpotifyTokenBundle | undefined;

    try {
      if (clientId && refreshToken && (!accessToken || Date.now() >= expiresAt - 45_000)) {
        const nextTokens = await refreshSpotifyAccessToken(refreshToken, clientId, clientSecret);
        if (nextTokens) {
          accessToken = nextTokens.accessToken;
          refreshedTokens = nextTokens;
        }
      }

      if (!accessToken) {
        res.status(401).json({ isPlaying: false, disconnected: true });
        return;
      }

      let playerRes = await fetch(SPOTIFY_CURRENTLY_PLAYING_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (playerRes.status === 401 && clientId && refreshToken && !refreshedTokens) {
        const nextTokens = await refreshSpotifyAccessToken(refreshToken, clientId, clientSecret);
        if (nextTokens) {
          refreshedTokens = nextTokens;
          accessToken = nextTokens.accessToken;
          playerRes = await fetch(SPOTIFY_CURRENTLY_PLAYING_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
      }

      if (playerRes.status === 204) {
        res.json({
          isPlaying: false,
          ...(refreshedTokens ? { refreshedTokens } : {}),
        });
        return;
      }

      if (playerRes.status === 401) {
        res.status(401).json({ isPlaying: false, disconnected: true });
        return;
      }

      if (!playerRes.ok) {
        res.json({
          isPlaying: false,
          ...(refreshedTokens ? { refreshedTokens } : {}),
        });
        return;
      }

      const data = (await playerRes.json()) as {
        is_playing?: boolean;
      };

      res.json({
        isPlaying: Boolean(data?.is_playing),
        ...(refreshedTokens ? { refreshedTokens } : {}),
      });
    } catch {
      res.json({
        isPlaying: false,
        ...(refreshedTokens ? { refreshedTokens } : {}),
      });
    }
  });

  const distPath = path.resolve(__dirname, 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const isDevMode = process.env.DEV_SERVER === '1' || !fs.existsSync(distIndexHtml);

  if (isDevMode) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(distIndexHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    // Servidor Express + Vite/SPA activo en puerto 3000
  });
}

void startServer();
