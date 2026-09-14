import type { Shoe } from "../types";
import { mergeCatalogs } from "../catalog";
import type { WardrobeDb } from "../db";
import { YandexDiskError, type YandexDiskClient } from "./disk";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncResult {
  items: Shoe[];
  pulled: boolean;
  pushed: boolean;
}

export async function syncWithDisk(
  db: WardrobeDb,
  disk: YandexDiskClient,
): Promise<SyncResult> {
  const local = await db.listAll();
  const remote = await disk.downloadCatalog();
  const remoteItems = remote?.items ?? [];
  const merged = mergeCatalogs(local, remoteItems);
  await db.putAll(merged);
  await disk.uploadCatalog(merged);
  return {
    items: merged,
    pulled: remote !== null,
    pushed: true,
  };
}

export function syncErrorMessage(error: unknown): string {
  if (error instanceof YandexDiskError) {
    if (error.status === 401) return "Сессия Яндекса истекла. Войдите снова.";
    if (error.status === 403) return "Недостаточно прав для записи на Яндекс Диск.";
    if (error.status === 507 || error.status === 413) {
      return "На Диске недостаточно места для каталога.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    if (error.message === "Failed to fetch" || /network/i.test(error.message)) {
      return "Нет сети. Карточки сохранены только на этом устройстве.";
    }
    return error.message;
  }
  return "Не удалось синхронизировать каталог с Яндекс Диском.";
}
