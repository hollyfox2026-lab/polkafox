import { beforeEach, describe, expect, it } from "vitest";
import {
  YANDEX_CLIENT_ID,
  YANDEX_REDIRECT_URI,
  YANDEX_SCOPE,
} from "../src/yandex/config";
import {
  acceptOAuthReturn,
  buildAuthorizeUrl,
  consumeOAuthRedirect,
  oauthHashState,
  parseOAuthHash,
  rememberOAuthPending,
  rememberOAuthState,
  resetOAuthConsume,
  takeOAuthState,
  verifyOAuthState,
  YANDEX_TOKEN_URL,
} from "../src/yandex/oauth";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    key(index) {
      return Object.keys(data)[index] ?? null;
    },
    removeItem(key) {
      delete data[key];
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

describe("Yandex OAuth", () => {
  beforeEach(() => {
    resetOAuthConsume();
  });

  it("собирает URL авторизации с ClientID, Redirect URI и правом app_folder", () => {
    const url = new URL(buildAuthorizeUrl("state-1"));
    expect(url.origin + url.pathname).toBe("https://oauth.yandex.ru/authorize");
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("client_id")).toBe(YANDEX_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(YANDEX_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe(YANDEX_SCOPE);
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("читает access_token из hash после редиректа", () => {
    const result = parseOAuthHash(
      "#access_token=y0_test&token_type=bearer&expires_in=3600&state=abc",
    );
    expect(result).toEqual({
      ok: true,
      token: { accessToken: "y0_test", tokenType: "bearer", expiresIn: 3600 },
    });
    expect(oauthHashState("#access_token=y0_test&state=abc")).toBe("abc");
  });

  it("читает отказ пользователя", () => {
    const result = parseOAuthHash("#error=access_denied&error_description=denied");
    expect(result).toEqual({
      ok: false,
      error: "access_denied",
      description: "denied",
    });
  });

  it("игнорирует пустой hash", () => {
    expect(parseOAuthHash("")).toBeNull();
    expect(parseOAuthHash("#")).toBeNull();
    expect(parseOAuthHash("#foo=bar")).toBeNull();
  });

  it("проверяет CSRF-state", () => {
    const storage = memoryStorage();
    rememberOAuthState("secret", storage);
    expect(takeOAuthState(storage)).toBe("secret");
    expect(takeOAuthState(storage)).toBeNull();
    expect(verifyOAuthState("secret", "secret")).toBe(true);
    expect(verifyOAuthState("secret", "other")).toBe(false);
    expect(verifyOAuthState(null, "secret")).toBe(false);
  });

  it("принимает токен на Redirect URI даже без совпадения state", () => {
    expect(
      acceptOAuthReturn(null, { state: "abc", verifier: "", startedAt: Date.now() }),
    ).toBe(true);
    expect(acceptOAuthReturn("abc", { state: "abc", verifier: "", startedAt: 1 })).toBe(true);
    expect(acceptOAuthReturn("other", { state: "abc", verifier: "", startedAt: 1 })).toBe(true);
  });

  it("сохраняет токен при повторном вызове consume (StrictMode)", async () => {
    const storage = memoryStorage();
    rememberOAuthPending({ state: "st", verifier: "v", startedAt: Date.now() }, storage);
    const location = {
      hash: "#access_token=y0_live&token_type=bearer&expires_in=3600&state=st",
      search: "",
      pathname: "/polkafox/",
    };
    const replaced: string[] = [];
    const first = consumeOAuthRedirect({
      location,
      replaceUrl: (url) => replaced.push(url),
      storage,
    });
    const second = consumeOAuthRedirect({
      location: { hash: "", search: "", pathname: "/polkafox/" },
      replaceUrl: () => {
        throw new Error("second consume must not re-read the URL");
      },
      storage,
    });
    await expect(first).resolves.toEqual({
      kind: "token",
      token: { accessToken: "y0_live", tokenType: "bearer", expiresIn: 3600 },
    });
    await expect(second).resolves.toEqual(await first);
    expect(replaced).toEqual(["/polkafox/"]);
  });

  it("читает токен из query, если hash пустой", async () => {
    const storage = memoryStorage();
    const result = await consumeOAuthRedirect({
      location: {
        hash: "",
        search: "?access_token=from-query&token_type=bearer&expires_in=10",
        pathname: "/polkafox/",
      },
      replaceUrl: () => {},
      storage,
    });
    expect(result).toEqual({
      kind: "token",
      token: { accessToken: "from-query", tokenType: "bearer", expiresIn: 10 },
    });
  });

  it("обменивает code на токен через PKCE", async () => {
    const storage = memoryStorage();
    rememberOAuthPending({ state: "st", verifier: "verifier-1", startedAt: Date.now() }, storage);
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(YANDEX_TOKEN_URL);
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      expect(body).toContain("code=ya-code");
      expect(body).toContain("code_verifier=verifier-1");
      return new Response(
        JSON.stringify({
          access_token: "from-code",
          token_type: "bearer",
          expires_in: 99,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const result = await consumeOAuthRedirect({
      location: {
        hash: "",
        search: "?code=ya-code&state=st",
        pathname: "/polkafox/",
      },
      replaceUrl: () => {},
      storage,
      fetchImpl,
    });
    expect(result).toEqual({
      kind: "token",
      token: { accessToken: "from-code", tokenType: "bearer", expiresIn: 99 },
    });
  });
});
