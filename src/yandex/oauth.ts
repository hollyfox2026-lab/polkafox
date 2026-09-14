import {
  OAUTH_STATE_KEY,
  YANDEX_AUTHORIZE_URL,
  YANDEX_CLIENT_ID,
  YANDEX_REDIRECT_URI,
} from "./config";

export const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
export const OAUTH_PENDING_KEY = "polka-yandex-oauth-pending";

export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export type OAuthRedirectResult =
  | { ok: true; token: OAuthToken }
  | { ok: false; error: string; description?: string };

export interface OAuthPending {
  state: string;
  verifier: string;
  startedAt: number;
}

export type ConsumeResult =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "token"; token: OAuthToken };

export interface LocationLike {
  hash: string;
  search: string;
  pathname: string;
}

let consumeOnce: Promise<ConsumeResult> | null = null;

export function resetOAuthConsume(): void {
  consumeOnce = null;
}

export function createOAuthState(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return base64UrlFromBytes(bytes);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlFromBytes(new Uint8Array(digest));
}

export function buildAuthorizeUrl(
  state: string,
  options: { redirectUri?: string; challenge?: string } = {},
): string {
  const params = new URLSearchParams({
    response_type: "token",
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: options.redirectUri ?? YANDEX_REDIRECT_URI,
    state,
  });
  if (options.challenge) {
    params.set("code_challenge", options.challenge);
    params.set("code_challenge_method", "S256");
  }
  return `${YANDEX_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Разбор fragment/query OAuth. Не используем URLSearchParams.get:
 * он превращает «+» в пробел и портит access_token.
 */
export function parseFragmentParams(raw: string): Record<string, string> {
  const value = raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw;
  const result: Record<string, string> = {};
  if (!value) return result;
  for (const part of value.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodeURIComponent(eq < 0 ? part : part.slice(0, eq));
    const encoded = eq < 0 ? "" : part.slice(eq + 1);
    result[key] = decodeURIComponent(encoded.replace(/\+/g, "%2B"));
  }
  return result;
}

export function parseOAuthParams(raw: string): OAuthRedirectResult | null {
  const params = parseFragmentParams(raw);
  if (!params.error && !params.access_token) return null;
  if (params.error) {
    return {
      ok: false,
      error: params.error,
      description: params.error_description || undefined,
    };
  }
  const expiresIn = Number(params.expires_in ?? "31536000");
  return {
    ok: true,
    token: {
      accessToken: params.access_token,
      tokenType: params.token_type || "bearer",
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 31536000,
    },
  };
}

export function parseOAuthHash(hash: string): OAuthRedirectResult | null {
  return parseOAuthParams(hash);
}

export function oauthParam(raw: string, name: string): string | null {
  const value = parseFragmentParams(raw)[name];
  return value === undefined || value === "" ? null : value;
}

export function oauthHashState(hash: string): string | null {
  return oauthParam(hash, "state");
}

export function rememberOAuthState(state: string, storage: Storage = localStorage): void {
  storage.setItem(OAUTH_STATE_KEY, state);
}

export function takeOAuthState(storage: Storage = localStorage): string | null {
  const value = storage.getItem(OAUTH_STATE_KEY);
  storage.removeItem(OAUTH_STATE_KEY);
  return value;
}

export function rememberOAuthPending(pending: OAuthPending, storage: Storage = localStorage): void {
  storage.setItem(OAUTH_PENDING_KEY, JSON.stringify(pending));
  rememberOAuthState(pending.state, storage);
}

export function readOAuthPending(storage: Storage = localStorage): OAuthPending | null {
  const raw = storage.getItem(OAUTH_PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthPending>;
    if (typeof parsed.state !== "string" || parsed.state.length === 0) return null;
    return {
      state: parsed.state,
      verifier: typeof parsed.verifier === "string" ? parsed.verifier : "",
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearOAuthPending(storage: Storage = localStorage): void {
  storage.removeItem(OAUTH_PENDING_KEY);
  storage.removeItem(OAUTH_STATE_KEY);
}

export function verifyOAuthState(returned: string | null, expected: string | null): boolean {
  if (!returned || !expected) return false;
  return returned === expected;
}

/** Токен на Redirect URI приложения принимаем: Яндекс не всегда возвращает state. */
export function acceptOAuthReturn(_returnedState: string | null, _pending: OAuthPending | null): boolean {
  return true;
}

export function consumeOAuthRedirect(options: {
  location?: LocationLike;
  replaceUrl?: (url: string) => void;
  storage?: Storage;
  fetchImpl?: typeof fetch;
} = {}): Promise<ConsumeResult> {
  consumeOnce ??= doConsumeOAuth(options);
  return consumeOnce;
}

async function doConsumeOAuth(options: {
  location?: LocationLike;
  replaceUrl?: (url: string) => void;
  storage?: Storage;
  fetchImpl?: typeof fetch;
}): Promise<ConsumeResult> {
  const location = options.location ?? (typeof window === "undefined" ? null : window.location);
  if (!location) return { kind: "none" };

  const hash = location.hash ?? "";
  const search = location.search ?? "";
  const combined = `${search}${hash}`;
  const hasOAuth =
    /access_token=/.test(combined) ||
    /[?&#]code=/.test(combined) ||
    /[?&#]error=/.test(combined);
  if (!hasOAuth) return { kind: "none" };

  const replaceUrl =
    options.replaceUrl ??
    ((url: string) => {
      history.replaceState(null, "", url);
    });
  replaceUrl(location.pathname || "/");

  const storage = options.storage ?? localStorage;
  const pending = readOAuthPending(storage);
  const parsed = parseOAuthParams(hash) ?? parseOAuthParams(search);

  if (parsed && !parsed.ok) {
    clearOAuthPending(storage);
    return {
      kind: "error",
      message: parsed.description || "Вход через Яндекс отменён.",
    };
  }

  if (parsed?.ok) {
    clearOAuthPending(storage);
    return { kind: "token", token: parsed.token };
  }

  const code = oauthParam(search, "code") ?? oauthParam(hash, "code");
  if (code) {
    try {
      const token = await exchangeAuthorizationCode(code, pending?.verifier ?? "", options.fetchImpl ?? fetch);
      clearOAuthPending(storage);
      return { kind: "token", token };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось обменять код Яндекса на токен.";
      return { kind: "error", message };
    }
  }

  return { kind: "none" };
}

export async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: YANDEX_REDIRECT_URI,
  });
  if (verifier) body.set("code_verifier", verifier);

  const response = await fetchImpl(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Яндекс не выдал токен. Проверьте тип приложения (JavaScript) и Redirect URI.",
    );
  }
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? "bearer",
    expiresIn: typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 31536000,
  };
}

export async function startYandexLogin(
  openUrl: (url: string) => void = defaultRedirect,
  storage: Storage = localStorage,
): Promise<void> {
  const state = createOAuthState();
  rememberOAuthPending({ state, verifier: "", startedAt: Date.now() }, storage);
  openUrl(buildAuthorizeUrl(state));
}

function defaultRedirect(url: string): void {
  window.location.assign(url);
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
