import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { consumeOAuthRedirect } from "./yandex/oauth";
import { saveSession } from "./yandex/session";
import "./styles.css";

const OAUTH_SW_BUST_KEY = "polka-oauth-sw-bust";

function hasOAuthReturn(): boolean {
  const combined = `${window.location.search}${window.location.hash}`;
  return /access_token=/.test(combined) || /[?&#]code=/.test(combined) || /[?&#]error=/.test(combined);
}

async function dropServiceWorkerCache(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  return registrations.length > 0;
}

async function boot(): Promise<void> {
  if (hasOAuthReturn() && sessionStorage.getItem(OAUTH_SW_BUST_KEY) !== "1") {
    sessionStorage.setItem(OAUTH_SW_BUST_KEY, "1");
    const hadWorker = await dropServiceWorkerCache();
    if (hadWorker) {
      window.location.reload();
      return;
    }
  }

  const oauth = await consumeOAuthRedirect();
  if (oauth.kind === "token") {
    saveSession({
      accessToken: oauth.token.accessToken,
      tokenType: oauth.token.tokenType,
      expiresAt: Date.now() + oauth.token.expiresIn * 1000,
      login: "",
      displayName: "Яндекс Диск",
    });
  }

  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

void boot();
