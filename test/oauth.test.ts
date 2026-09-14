import { describe, expect, it } from "vitest";
import {
  YANDEX_CLIENT_ID,
  YANDEX_REDIRECT_URI,
  YANDEX_SCOPE,
} from "../src/yandex/config";
import {
  buildAuthorizeUrl,
  oauthHashState,
  parseOAuthHash,
  rememberOAuthState,
  takeOAuthState,
  verifyOAuthState,
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
});
