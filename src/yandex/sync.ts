import type { Shoe } from "../types";
import { activeShoes, mergeCatalogs } from "../catalog";
import type { WardrobeDb } from "../db";
import { YandexDiskError, type YandexDiskClient } from "./disk";
import type { CatalogFile } from "../types";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncResult {
  items: Shoe[];
  pulled: boolean;
  pushed: boolean;
}

/**
 * Сначала читает Диск, затем сливает с локальной копией.
 * Пустой клиент (новая иконка на экране Домой) не записывает на Диск пустой каталог.
 */
export async function syncWithDisk(
  db: WardrobeDb,
  disk: YandexDiskClient,
): Promise<SyncResult> {
  const local = await db.listAll();
  const localActive = activeShoes(local);

  let remote: CatalogFile | null;
  try {
    remote = await disk.downloadCatalog();
  } catch (error) {
    if (localActive.length === 0) throw error;
    await disk.uploadCatalog(local);
    await db.putAll(local);
    return { items: local, pulled: false, pushed: true };
  }

  const remoteItems = remote?.items ?? [];
  const merged = mergeCatalogs(local, remoteItems);
  const mergedActive = activeShoes(merged);
  await db.putAll(merged);

  const nothingToPublish = mergedActive.length === 0;
  if (nothingToPublish) {
    return { items: merged, pulled: remote !== null, pushed: false };
  }

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
    if (error.message === "Failed to fetch" || /network|cors/i.test(error.message)) {
      return "Браузер не смог обратиться к Яндекс Диску. Карточки остались на этом устройстве. Нажмите «Синхронизировать» ещё раз.";
    }
    return error.message;
  }
  return "Не удалось синхронизировать каталог с Яндекс Диском.";
}
