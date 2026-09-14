import type { Shoe } from "../types";
import { activeShoes, isInlinePhoto, mergeCatalogs } from "../catalog";
import type { WardrobeDb } from "../db";
import { YandexDiskError, isBrowserNetworkError, type YandexDiskClient } from "./disk";
import type { CatalogFile } from "../types";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncResult {
  items: Shoe[];
  pulled: boolean;
  pushed: boolean;
  photoCount: number;
}

/**
 * Сначала читает Диск, затем сливает с локальной копией.
 * Фотографии качаются и пишутся отдельными файлами.
 * Пустой клиент (иконка на экране Домой) не записывает на Диск пустой каталог.
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
    await pushAll(disk, local);
    await db.putAll(local);
    return {
      items: local,
      pulled: false,
      pushed: true,
      photoCount: localActive.filter((item) => item.photo).length,
    };
  }

  const remoteItems = remote?.items ?? [];
  const merged = mergeCatalogs(local, remoteItems);
  const withPhotos = await fillMissingPhotos(merged, remoteItems, disk);
  const mergedActive = activeShoes(withPhotos);
  await db.putAll(withPhotos);

  if (mergedActive.length === 0) {
    return { items: withPhotos, pulled: remote !== null, pushed: false, photoCount: 0 };
  }

  await pushAll(disk, withPhotos);
  return {
    items: withPhotos,
    pulled: remote !== null,
    pushed: true,
    photoCount: mergedActive.filter((item) => item.photo).length,
  };
}

async function fillMissingPhotos(
  merged: Shoe[],
  remoteItems: Shoe[],
  disk: YandexDiskClient,
): Promise<Shoe[]> {
  const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
  const next = [...merged];
  const jobs: Array<{ index: number; id: string }> = [];
  for (let index = 0; index < next.length; index += 1) {
    const item = next[index];
    if (!item || item.deletedAt || isInlinePhoto(item.photo)) continue;
    const remote = remoteById.get(item.id);
    if (remote?.photo && isInlinePhoto(remote.photo)) {
      next[index] = { ...item, photo: remote.photo, hasPhoto: true };
      continue;
    }
    if (item.photo || remote) jobs.push({ index, id: item.id });
  }
  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        return { ...job, photo: await disk.downloadPhoto(job.id) };
      } catch {
        return { ...job, photo: null };
      }
    }),
  );
  for (const result of results) {
    const current = next[result.index];
    if (!current || !result.photo) continue;
    next[result.index] = { ...current, photo: result.photo, hasPhoto: true };
  }
  return next;
}

async function pushAll(disk: YandexDiskClient, items: Shoe[]): Promise<void> {
  for (const item of activeShoes(items)) {
    if (!isInlinePhoto(item.photo) || !item.photo) continue;
    await disk.uploadPhoto(item.id, item.photo);
  }
  await disk.uploadCatalog(items);
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
    if (error.message === "Failed to fetch" || isBrowserNetworkError(error.message)) {
      return "Это окно не смогло связаться с Яндекс Диском. Нажмите «Синхронизировать» ещё раз.";
    }
    return error.message;
  }
  return "Не удалось синхронизировать каталог с Яндекс Диском.";
}
