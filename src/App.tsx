import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ShoeCard } from "./components/ShoeCard";
import { ShoeDetail } from "./components/ShoeDetail";
import { ShoeForm } from "./components/ShoeForm";
import { DiskBar } from "./components/DiskBar";
import { activeShoes } from "./catalog";
import { wardrobeDb } from "./db";
import {
  EMPTY_DRAFT,
  pairWord,
  SEASON_INFO,
  SEASONS,
  TYPE_LABELS,
  newId,
  type Route,
  type SeasonFilter,
  type Shoe,
  type ShoeDraft,
} from "./types";
import { DeviceLogin } from "./components/DeviceLogin";
import { LoginSheet } from "./components/LoginSheet";
import { createYandexDiskClient, YandexDiskError } from "./yandex/disk";
import { requestDeviceCode, pollDeviceToken, type DeviceAuthRequest } from "./yandex/device";
import { consumeOAuthRedirect, startYandexLogin, type OAuthToken } from "./yandex/oauth";
import {
  clearSession,
  loadSession,
  saveSession,
  serializeSession,
  sessionFromUnknown,
  type YandexSession,
} from "./yandex/session";
import { syncErrorMessage, syncWithDisk, type SyncStatus } from "./yandex/sync";
import { isAppleMobile, isIsolatedHomeScreen } from "./display";

export function App() {
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [route, setRoute] = useState<Route>({ name: "list" });
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState<SeasonFilter>("all");
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<YandexSession | null>(() => loadSession());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(session ? "idle" : "offline");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthRequest | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const syncing = useRef(false);
  const pendingPush = useRef(false);

  const reload = useCallback(async () => {
    const items = await wardrobeDb.listAll();
    setShoes(items);
  }, []);

  const runSync = useCallback(async (activeSession: YandexSession) => {
    if (syncing.current) {
      pendingPush.current = true;
      return;
    }
    syncing.current = true;
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      const disk = createYandexDiskClient(activeSession.accessToken);
      const result = await syncWithDisk(wardrobeDb, disk);
      setShoes(result.items);
      setLastSyncAt(Date.now());
      setSyncStatus("synced");
      const count = activeShoes(result.items).length;
      if (count > 0 && result.pulled) {
        setBanner(`С Яндекс Диска загружено: ${count} ${pairWord(count)}.`);
      } else if (count > 0 && result.pushed) {
        setBanner(`На Яндекс Диск записано: ${count} ${pairWord(count)}.`);
      } else if (count === 0 && result.pulled) {
        setBanner(
          "На Яндекс Диске пока нет карточек. Откройте Полку в Safari, где фото уже есть, дождитесь записи на Диск, затем нажмите «Синхронизировать» здесь.",
        );
      }
    } catch (error) {
      setSyncStatus("error");
      setSyncError(syncErrorMessage(error));
      if (error instanceof YandexDiskError && error.status === 401) {
        setBanner("Яндекс не принял доступ к Диску. Откройте меню Диска и войдите снова.");
      }
    } finally {
      syncing.current = false;
      if (pendingPush.current && loadSession()) {
        pendingPush.current = false;
        const next = loadSession();
        if (next) void runSync(next);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const oauth = await consumeOAuthRedirect();
      if (oauth.kind === "error") {
        setBanner(oauth.message);
      } else if (oauth.kind === "token") {
        const nextSession = await sessionFromToken(oauth.token);
        setSession(nextSession);
        setBanner("Яндекс Диск подключён. Каталог загружается.");
      }

      await reload();
      if (!cancelled) setLoaded(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!loaded || !session) return;
    void runSync(session);
  }, [loaded, session, runSync]);

  useEffect(() => {
    if (!loaded || !session) return;
    function refresh() {
      if (document.visibilityState === "hidden") return;
      const next = loadSession();
      if (next) void runSync(next);
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [loaded, session, runSync]);

  useEffect(() => {
    if (!deviceAuth) return;
    const request = deviceAuth;
    let cancelled = false;
    let delay = request.intervalMs;
    let timer = 0;

    async function tick() {
      if (cancelled) return;
      if (Date.now() > request.expiresAt) {
        setDeviceAuth(null);
        setBanner("Код Яндекса истёк. Нажмите «Войти в Диск» ещё раз.");
        return;
      }
      const result = await pollDeviceToken(request.deviceCode);
      if (cancelled) return;
      if (result.kind === "token") {
        setDeviceAuth(null);
        const nextSession = await sessionFromToken(result.token);
        setSession(nextSession);
        setBanner("Яндекс Диск подключён. Каталог загружается.");
        return;
      }
      if (result.kind === "denied") {
        setDeviceAuth(null);
        setBanner(result.message);
        return;
      }
      if (result.kind === "slow") delay += 3000;
      timer = window.setTimeout(() => void tick(), delay);
    }

    function onVisible() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deviceAuth]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeShoes(shoes).filter((shoe) => {
      if (season !== "all" && !shoe.seasons.includes(season)) return false;
      if (!q) return true;
      const haystack = [
        shoe.name,
        shoe.brand,
        shoe.size,
        shoe.color,
        shoe.description,
        TYPE_LABELS[shoe.type],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, season, shoes]);

  const current =
    route.name === "detail" || route.name === "form"
      ? activeShoes(shoes).find((shoe) => shoe.id === route.id)
      : undefined;

  async function saveDraft(draft: ShoeDraft, editId?: string) {
    const now = Date.now();
    const next: Shoe = editId
      ? {
          ...(shoes.find((item) => item.id === editId) as Shoe),
          ...draft,
          updatedAt: now,
          deletedAt: null,
        }
      : {
          ...draft,
          id: newId(),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
    await wardrobeDb.put(next);
    await reload();
    setRoute({ name: "detail", id: next.id });
    if (session) void runSync(session);
  }

  async function deleteShoe(id: string) {
    const existing = shoes.find((item) => item.id === id);
    if (!existing) return;
    const now = Date.now();
    await wardrobeDb.put({ ...existing, deletedAt: now, updatedAt: now, photo: null });
    await reload();
    setRoute({ name: "list" });
    if (session) void runSync(session);
  }

  const activeCount = activeShoes(shoes).length;
  const appleMobile = isAppleMobile();
  const isolated = isIsolatedHomeScreen();
  const homeScreenHint = appleMobile
    ? isolated
      ? session
        ? "Это отдельная копия с экрана «Домой». Нажмите «Синхронизировать», чтобы забрать каталог с Яндекс Диска."
        : "Это отдельная копия с экрана «Домой». Нажмите «Войти в Диск»: вставьте вход, скопированный в Safari, либо войдите через Яндекс."
      : "Чтобы полка была и на значке, в Safari откройте меню Диска и нажмите «Скопировать вход». Затем откройте значок и вставьте вход."
    : null;

  function applyPastedSession() {
    const next = sessionFromUnknown(pasteValue);
    if (!next) {
      setPasteError("Не удалось прочитать вход. Скопируйте его заново в Safari: меню Диска → «Скопировать вход».");
      return;
    }
    saveSession(next);
    setSession(next);
    setLoginOpen(false);
    setPasteValue("");
    setPasteError(null);
    setBanner("Яндекс Диск подключён. Каталог загружается.");
  }

  async function handleDeviceLogin() {
    try {
      const request = await requestDeviceCode();
      setLoginOpen(false);
      setDeviceAuth(request);
      setBanner("Введите код на странице Яндекса и вернитесь сюда.");
    } catch (error) {
      setPasteError(
        error instanceof Error
          ? `${error.message} Вставьте вход из Safari или войдите через Яндекс.`
          : "Яндекс не выдал код. Вставьте вход из Safari.",
      );
    }
  }

  async function handleLogin() {
    setPasteError(null);
    if (appleMobile) {
      setLoginOpen(true);
      return;
    }
    await startYandexLogin();
  }

  async function copySession() {
    if (!session) return;
    const text = serializeSession(session);
    try {
      await navigator.clipboard.writeText(text);
      setBanner("Вход скопирован. Откройте Полку с экрана «Домой» → «Войти в Диск» → вставьте вход.");
    } catch {
      window.prompt("Скопируйте вход и вставьте его в Полку на значке:", text);
    }
  }

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="eyebrow">Гардероб обуви</span>
            <h1>Полка</h1>
          </div>
          <div className="top-actions">
            <div className="count-pill">
              {activeCount === 0 ? "пусто" : `${activeCount} ${pairWord(activeCount)}`}
            </div>
            <DiskBar
              session={session}
              status={session ? syncStatus : "offline"}
              error={syncError}
              lastSyncAt={lastSyncAt}
              onLogin={() => void handleLogin()}
              onLogout={() => {
                clearSession();
                setSession(null);
                setSyncStatus("offline");
                setSyncError(null);
                setBanner("Диск отключён. Карточки остаются на этом устройстве.");
              }}
              onSync={() => {
                if (session) void runSync(session);
              }}
              onCopySession={() => void copySession()}
            />
          </div>
        </header>
        {banner ? (
          <p className="banner" role="status">
            {banner}
            <button type="button" className="banner-close" onClick={() => setBanner(null)}>
              Закрыть
            </button>
          </p>
        ) : null}
        {homeScreenHint ? <p className="local-hint">{homeScreenHint}</p> : null}
        {!session && !homeScreenHint ? (
          <p className="local-hint">
            Карточки хранятся на этом устройстве. Чтобы открыть тот же каталог на другом устройстве,
            войдите через Яндекс.
          </p>
        ) : null}
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию, цвету, размеру"
          type="search"
        />
        <div className="season-bar">
          <button className={`chip ${season === "all" ? "active" : ""}`} onClick={() => setSeason("all")}>
            Все
          </button>
          {SEASONS.map((item) => (
            <button
              className={`chip ${item} ${season === item ? "active" : ""}`}
              onClick={() => setSeason(item)}
              key={item}
            >
              {SEASON_INFO[item].label}
            </button>
          ))}
        </div>
        {loaded ? (
          visible.length === 0 ? (
            <EmptyState
              hasCollection={activeCount > 0}
              season={season}
              onAdd={() => setRoute({ name: "form" })}
            />
          ) : (
            <div className="grid">
              {visible.map((shoe) => (
                <ShoeCard
                  shoe={shoe}
                  key={shoe.id}
                  onOpen={() => setRoute({ name: "detail", id: shoe.id })}
                />
              ))}
            </div>
          )
        ) : null}
      </div>
      {route.name === "list" ? (
        <button className="fab" aria-label="Добавить пару" onClick={() => setRoute({ name: "form" })}>
          +
        </button>
      ) : null}
      {route.name === "detail" && current ? (
        <ShoeDetail
          shoe={current}
          onBack={() => setRoute({ name: "list" })}
          onEdit={() => setRoute({ name: "form", id: current.id })}
          onDelete={() => {
            if (window.confirm("Удалить эту пару с полки?")) void deleteShoe(current.id);
          }}
        />
      ) : null}
      {route.name === "form" ? (
        <ShoeForm
          initial={current ?? EMPTY_DRAFT}
          title={route.id ? "Редактирование" : "Новая пара"}
          onCancel={() => setRoute(current ? { name: "detail", id: current.id } : { name: "list" })}
          onSave={(draft) => void saveDraft(draft, route.id)}
        />
      ) : null}
      {loginOpen ? (
        <LoginSheet
          pasteValue={pasteValue}
          pasteError={pasteError}
          onPasteValue={(value) => {
            setPasteValue(value);
            setPasteError(null);
          }}
          onApplyPaste={applyPastedSession}
          onYandex={() => void startYandexLogin()}
          onDeviceCode={() => void handleDeviceLogin()}
          onCancel={() => {
            setLoginOpen(false);
            setPasteError(null);
          }}
        />
      ) : null}
      {deviceAuth ? (
        <DeviceLogin
          request={deviceAuth}
          onOpenYandex={() => {
            window.open(deviceAuth.verificationUrl, "_blank", "noopener");
          }}
          onCancel={() => setDeviceAuth(null)}
        />
      ) : null}
    </>
  );
}

async function sessionFromToken(token: OAuthToken): Promise<YandexSession> {
  const session: YandexSession = {
    accessToken: token.accessToken,
    tokenType: token.tokenType,
    expiresAt: Date.now() + token.expiresIn * 1000,
    login: "",
    displayName: "Яндекс Диск",
  };
  saveSession(session);
  try {
    const user = await createYandexDiskClient(token.accessToken).getUser();
    const named: YandexSession = {
      ...session,
      login: user.login,
      displayName: user.displayName || user.login || "Яндекс Диск",
    };
    saveSession(named);
    return named;
  } catch {
    return session;
  }
}
