import { INDEX_DIR } from "./config";

/** Запас под лимит custom_properties Яндекса (1024 байта на ресурс). */
export const INDEX_CHUNK_BYTES = 700;
export const INDEX_PAYLOAD_KEY = "p";
export const INDEX_COUNT_KEY = "n";

export function folderRoot(folder: string): string {
  return folder.endsWith("/") ? folder : `${folder}/`;
}

export function indexDir(folder: string): string {
  return `${folderRoot(folder)}${INDEX_DIR}`;
}

export function chunkName(index: number): string {
  return `c${String(index).padStart(3, "0")}`;
}

export function indexChunkPath(folder: string, index: number): string {
  return `${indexDir(folder)}/${chunkName(index)}`;
}

export function splitUtf8(text: string, maxBytes: number): string[] {
  if (maxBytes < 4) throw new Error("Слишком маленький фрагмент каталога.");
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  for (const char of text) {
    const next = current + char;
    if (encoder.encode(next).length > maxBytes) {
      if (!current) throw new Error("Символ каталога не помещается в фрагмент Диска.");
      chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [""];
}

export function catalogIndexChunks(json: string): string[] {
  return splitUtf8(json, INDEX_CHUNK_BYTES);
}

export function joinIndexChunks(parts: string[]): string {
  return parts.join("");
}

export function parseIndexCount(properties: unknown): number | null {
  if (!properties || typeof properties !== "object") return null;
  const raw = (properties as Record<string, unknown>)[INDEX_COUNT_KEY];
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  return null;
}

export function readIndexPayload(properties: unknown): string {
  if (!properties || typeof properties !== "object") return "";
  const raw = (properties as Record<string, unknown>)[INDEX_PAYLOAD_KEY];
  return typeof raw === "string" ? raw : "";
}

export function indexProperties(payload: string): Record<string, string> {
  return { [INDEX_PAYLOAD_KEY]: payload };
}

export function indexDirProperties(count: number): Record<string, string> {
  return { [INDEX_COUNT_KEY]: String(count) };
}
