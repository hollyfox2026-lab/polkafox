import { describe, expect, it } from "vitest";
import {
  catalogIndexChunks,
  joinIndexChunks,
  parseIndexCount,
  readIndexPayload,
  splitUtf8,
} from "../src/yandex/catalogIndex";

describe("catalogIndex", () => {
  it("режет JSON по байтам UTF-8 и собирает обратно", () => {
    const text = `${"я".repeat(50)}catalog`;
    const parts = splitUtf8(text, 20);
    expect(parts.length).toBeGreaterThan(1);
    expect(joinIndexChunks(parts)).toBe(text);
    const encoder = new TextEncoder();
    for (const part of parts) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(20);
    }
  });

  it("кладёт каталог в один фрагмент, если он короткий", () => {
    const json = JSON.stringify({ version: 2, updatedAt: 1, items: [] });
    expect(catalogIndexChunks(json)).toEqual([json]);
  });

  it("читает число фрагментов из свойств папки", () => {
    expect(parseIndexCount({ n: "3" })).toBe(3);
    expect(parseIndexCount({ n: 2 })).toBe(2);
    expect(parseIndexCount({})).toBeNull();
    expect(readIndexPayload({ p: "{\"a\":1}" })).toBe("{\"a\":1}");
  });
});
