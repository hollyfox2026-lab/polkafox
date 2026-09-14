import { YANDEX_CLIENT_ID } from "./config";
import { YANDEX_TOKEN_URL, type OAuthToken } from "./oauth";

export const YANDEX_DEVICE_CODE_URL = "https://oauth.yandex.ru/device/code";
export const YANDEX_DEVICE_VERIFY_URL = "https://oauth.yandex.ru/device";

export interface DeviceAuthRequest {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  intervalMs: number;
  expiresAt: number;
}

export type DevicePollResult =
  | { kind: "token"; token: OAuthToken }
  | { kind: "pending" }
  | { kind: "slow" }
  | { kind: "denied"; message: string };

/**
 * Вход по коду: окно на экране «Домой» не уходит в Safari и не теряет токен.
 */
export async function requestDeviceCode(fetchImpl: typeof fetch = fetch): Promise<DeviceAuthRequest> {
  const deviceId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `polka-${Date.now().toString(36)}`;
  const response = await fetchImpl(YANDEX_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: YANDEX_CLIENT_ID,
      device_id: deviceId,
      device_name: "Polka",
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    device_code?: string;
    user_code?: string;
    verification_url?: string;
    verification_uri?: string;
    interval?: number;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.device_code) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Яндекс не выдал код устройства. Удалите значок Полки и добавьте вкладку из Safari.",
    );
  }
  const interval = typeof data.interval === "number" && data.interval > 0 ? data.interval : 5;
  const expiresIn = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 300;
  return {
    deviceCode: data.device_code,
    userCode: data.user_code || "",
    verificationUrl: data.verification_url || data.verification_uri || YANDEX_DEVICE_VERIFY_URL,
    intervalMs: Math.max(3, interval) * 1000,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function pollDeviceToken(
  deviceCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DevicePollResult> {
  const response = await fetchImpl(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "device_code",
      code: deviceCode,
      client_id: YANDEX_CLIENT_ID,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (typeof data.access_token === "string" && data.access_token.length > 0) {
    const expiresIn = Number(data.expires_in);
    return {
      kind: "token",
      token: {
        accessToken: data.access_token,
        tokenType: data.token_type || "bearer",
        expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 31536000,
      },
    };
  }
  if (data.error === "authorization_pending") return { kind: "pending" };
  if (data.error === "slow_down") return { kind: "slow" };
  return {
    kind: "denied",
    message:
      data.error_description ||
      data.error ||
      "Яндекс отклонил вход по коду. Удалите значок и добавьте вкладку из Safari.",
  };
}
