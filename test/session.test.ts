import { describe, expect, it } from "vitest";
import { loadSession, saveSession, clearSession, isSessionExpired } from "../src/yandex/session";
import { SESSION_STORAGE_KEY } from "../src/yandex/config";

function memoryStorage(): Storage {
  const data: Record<string, string> = {};
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

describe("Yandex session", () => {
  it("сохраняет и читает сессию", () => {
    const storage = memoryStorage();
    saveSession(
      {
        accessToken: "tok",
        tokenType: "bearer",
        expiresAt: Date.now() + 10_000,
        login: "fox",
        displayName: "Лиса",
      },
      storage,
    );
    const loaded = loadSession(storage);
    expect(loaded?.login).toBe("fox");
    expect(loaded?.accessToken).toBe("tok");
    expect(storage.getItem(SESSION_STORAGE_KEY)).toContain("tok");
    clearSession(storage);
    expect(loadSession(storage)).toBeNull();
  });

  it("отбрасывает просроченный токен", () => {
    const storage = memoryStorage();
    const session = {
      accessToken: "tok",
      tokenType: "bearer",
      expiresAt: 1,
      login: "fox",
      displayName: "Лиса",
    };
    saveSession(session, storage);
    expect(isSessionExpired(session, 100)).toBe(true);
    expect(loadSession(storage, 100)).toBeNull();
  });
});
