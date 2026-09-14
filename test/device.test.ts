import { describe, expect, it } from "vitest";
import { YANDEX_CLIENT_ID } from "../src/yandex/config";
import {
  pollDeviceToken,
  requestDeviceCode,
  YANDEX_DEVICE_CODE_URL,
} from "../src/yandex/device";
import { YANDEX_TOKEN_URL } from "../src/yandex/oauth";

describe("Yandex device login", () => {
  it("запрашивает user_code для входа без ухода в Safari", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(YANDEX_DEVICE_CODE_URL);
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toContain(`client_id=${YANDEX_CLIENT_ID}`);
      return new Response(
        JSON.stringify({
          device_code: "dev-1",
          user_code: "ABCD-EFGH",
          verification_url: "https://oauth.yandex.ru/device",
          interval: 5,
          expires_in: 300,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const request = await requestDeviceCode(fetchImpl);
    expect(request.userCode).toBe("ABCD-EFGH");
    expect(request.deviceCode).toBe("dev-1");
    expect(request.intervalMs).toBe(5000);
    expect(request.verificationUrl).toContain("oauth.yandex.ru/device");
  });

  it("ждёт подтверждение и затем отдаёт токен", async () => {
    const pending: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "authorization_pending" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    await expect(pollDeviceToken("dev-1", pending)).resolves.toEqual({ kind: "pending" });

    const ok: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(YANDEX_TOKEN_URL);
      expect(String(init?.body)).toContain("grant_type=device_code");
      expect(String(init?.body)).toContain("code=dev-1");
      return new Response(
        JSON.stringify({ access_token: "y0_device", token_type: "bearer", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    await expect(pollDeviceToken("dev-1", ok)).resolves.toEqual({
      kind: "token",
      token: { accessToken: "y0_device", tokenType: "bearer", expiresIn: 3600 },
    });
  });

  it("поясняет отказ Яндекса", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "unsupported_grant_type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    const result = await pollDeviceToken("dev-1", fetchImpl);
    expect(result.kind).toBe("denied");
  });
});
