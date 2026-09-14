import { useEffect, useRef, useState } from "react";
import type { YandexSession } from "../yandex/session";
import type { SyncStatus } from "../yandex/sync";

interface DiskBarProps {
  session: YandexSession | null;
  status: SyncStatus;
  error: string | null;
  lastSyncAt: number | null;
  onLogin: () => void;
  onLogout: () => void;
  onSync: () => void;
}

export function DiskBar({
  session,
  status,
  error,
  lastSyncAt,
  onLogin,
  onLogout,
  onSync,
}: DiskBarProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const label = session
    ? status === "syncing"
      ? "Синхронизация…"
      : status === "error"
        ? "Ошибка Диска"
        : session.displayName || session.login || "Яндекс Диск"
    : "Войти в Диск";

  return (
    <div className="disk-wrap" ref={panelRef}>
      <button
        type="button"
        className={`disk-chip ${session ? "connected" : ""} ${status === "error" ? "error" : ""}`}
        onClick={() => (session ? setOpen((value) => !value) : onLogin())}
        aria-expanded={session ? open : undefined}
      >
        {label}
      </button>
      {open && session ? (
        <div className="disk-panel" role="dialog" aria-label="Яндекс Диск">
          <p className="disk-panel-title">Яндекс Диск</p>
          <p className="disk-panel-user">{session.displayName || session.login}</p>
          <p className="disk-panel-status">{statusText(status, error, lastSyncAt)}</p>
          <div className="disk-panel-actions">
            <button type="button" className="ghost" onClick={onSync} disabled={status === "syncing"}>
              Синхронизировать
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Выйти
            </button>
          </div>
          <p className="disk-panel-note">
            Без входа карточки остаются только в браузере этого устройства.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function statusText(status: SyncStatus, error: string | null, lastSyncAt: number | null): string {
  if (status === "syncing") return "Идёт обмен с Диском.";
  if (status === "error") return error || "Синхронизация не выполнена.";
  if (status === "offline") return "Нет сети. Используется локальная копия.";
  if (lastSyncAt) {
    return `Каталог обновлён: ${new Date(lastSyncAt).toLocaleString("ru-RU")}.`;
  }
  return "Диск подключён. Каталог будет сохранён после первой синхронизации.";
}
