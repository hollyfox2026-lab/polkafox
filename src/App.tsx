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
import { createYandexDiskClient, YandexDiskError } from "./yandex/disk";
import {
  oauthHashState,
  parseOAuthHash,
  startYandexLogin,
  takeOAuthState,
  verifyOAuthState,
} from "./yandex/oauth";
import { clearSession, loadSession, saveSession, type YandexSession } from "./yandex/session";
import { syncErrorMessage, syncWithDisk, type SyncStatus } from "./yandex/sync";

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
    } catch (error) {
      if (error instanceof YandexDiskError && error.status === 401) {
        clearSession();
        setSession(null);
        setSyncStatus("offline");
        setSyncError("Сессия Яндекса истекла. Войдите снова.");
      } else {
        setSyncStatus("error");
        setSyncError(syncErrorMessage(error));
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
      const hash = window.location.hash;
      const oauth = parseOAuthHash(hash);
      if (oauth) {
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        if (!oauth.ok) {
          setBanner(oauth.description || "Вход через Яндекс отменён.");
        } else {
          const expected = takeOAuthState();
          const returned = oauthHashState(hash);
          if (!verifyOAuthState(returned, expected)) {
            setBanner("Вход через Яндекс не подтверждён. Повторите попытку.");
          } else {
            try {
              const disk = createYandexDiskClient(oauth.token.accessToken);
              const user = await disk.getUser();
              const nextSession: YandexSession = {
                accessToken: oauth.token.accessToken,
                tokenType: oauth.token.tokenType,
                expiresAt: Date.now() + oauth.token.expiresIn * 1000,
                login: user.login,
                displayName: user.displayName,
              };
              saveSession(nextSession);
              if (!cancelled) {
                setSession(nextSession);
                setBanner("Яндекс Диск подключён. Каталог загружается.");
              }
            } catch (error) {
              if (!cancelled) {
                setBanner(syncErrorMessage(error));
              }
            }
          }
        }
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
              onLogin={() => startYandexLogin()}
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
        {!session ? (
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
    </>
  );
}
