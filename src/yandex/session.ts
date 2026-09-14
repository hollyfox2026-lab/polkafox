import { SESSION_STORAGE_KEY } from "./config";

export interface YandexSession {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  login: string;
  displayName: string;
}

export function sessionFromUnknown(raw: unknown, now = Date.now()): YandexSession | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    if (text.startsWith("{")) {
      try {
        return sessionFromUnknown(JSON.parse(text) as unknown, now);
      } catch {
        return null;
      }
    }
    if (text.length < 16) return null;
    return {
      accessToken: text,
      tokenType: "bearer",
      expiresAt: now + 31536000 * 1000,
      login: "",
      displayName: "Яндекс Диск",
    };
  }
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<YandexSession>;
  if (typeof parsed.accessToken !== "string" || parsed.accessToken.length === 0) return null;
  const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
  if (expiresAt && expiresAt <= now) return null;
  return {
    accessToken: parsed.accessToken,
    tokenType: typeof parsed.tokenType === "string" ? parsed.tokenType : "bearer",
    expiresAt,
    login: typeof parsed.login === "string" ? parsed.login : "",
    displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
  };
}

export function serializeSession(session: YandexSession): string {
  return JSON.stringify(session);
}

export function loadSession(
  storage: Pick<Storage, "getItem"> = localStorage,
  now = Date.now(),
): YandexSession | null {
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  return sessionFromUnknown(raw, now);
}

export function saveSession(
  session: YandexSession,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(storage: Pick<Storage, "removeItem"> = localStorage): void {
  storage.removeItem(SESSION_STORAGE_KEY);
}

export function isSessionExpired(session: YandexSession, now = Date.now()): boolean {
  return session.expiresAt > 0 && session.expiresAt <= now;
}
