import {
  OAUTH_STATE_KEY,
  YANDEX_AUTHORIZE_URL,
  YANDEX_CLIENT_ID,
  YANDEX_REDIRECT_URI,
  YANDEX_SCOPE,
} from "./config";

export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export type OAuthRedirectResult =
  | { ok: true; token: OAuthToken }
  | { ok: false; error: string; description?: string };

export function createOAuthState(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildAuthorizeUrl(state: string, redirectUri = YANDEX_REDIRECT_URI): string {
  const params = new URLSearchParams({
    response_type: "token",
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: YANDEX_SCOPE,
    state,
  });
  return `${YANDEX_AUTHORIZE_URL}?${params.toString()}`;
}

export function parseOAuthHash(hash: string): OAuthRedirectResult | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const error = params.get("error");
  if (error) {
    return {
      ok: false,
      error,
      description: params.get("error_description") ?? undefined,
    };
  }
  const accessToken = params.get("access_token");
  if (!accessToken) return null;
  const expiresIn = Number(params.get("expires_in") ?? "31536000");
  return {
    ok: true,
    token: {
      accessToken,
      tokenType: params.get("token_type") ?? "bearer",
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 31536000,
    },
  };
}

export function rememberOAuthState(state: string, storage: Storage = sessionStorage): void {
  storage.setItem(OAUTH_STATE_KEY, state);
}

export function takeOAuthState(storage: Storage = sessionStorage): string | null {
  const value = storage.getItem(OAUTH_STATE_KEY);
  storage.removeItem(OAUTH_STATE_KEY);
  return value;
}

export function verifyOAuthState(returned: string | null, expected: string | null): boolean {
  if (!returned || !expected) return false;
  return returned === expected;
}

export function oauthHashState(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw).get("state");
}

export function startYandexLogin(openUrl: (url: string) => void = defaultRedirect): void {
  const state = createOAuthState();
  rememberOAuthState(state);
  openUrl(buildAuthorizeUrl(state));
}

function defaultRedirect(url: string): void {
  window.location.assign(url);
}
