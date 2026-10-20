// Hash collection operations for Redox store.

import type { StorageContext } from "../context.js";
import type { HashEntry } from "../types.js";
import { calculateEntryBytes } from "../memory.js";
import { ERR_WRONG_TYPE } from "../../utils/constants.js";
import { getValidEntry, commitEntry, shrinkOrDeleteEntry } from "./common.js";

export function hset(ctx: StorageContext, key: string, fieldPairs: [string, string][]): number {
  ctx.checkExpired(key);

  const entry = ctx.data.get(key);
  if (entry && entry.type !== "hash") {
    throw new Error(ERR_WRONG_TYPE);
  }

  let createdCount = 0;
  const fieldsMap = entry ? new Map(entry.fields) : new Map<string, string>();

  for (const [f, v] of fieldPairs) {
    if (!fieldsMap.has(f)) {
      createdCount++;
    }
    fieldsMap.set(f, v);
  }

  const newEntry: HashEntry = {
    type: "hash",
    fields: fieldsMap,
    lastAccessedAt: Date.now(),
    expiresAt: entry?.expiresAt,
  };

  commitEntry(ctx, key, newEntry, entry);
  return createdCount;
}

export function hget(ctx: StorageContext, key: string, field: string): string | undefined {
  const entry = getValidEntry(ctx, key, "hash");
  if (!entry) return undefined;
  entry.lastAccessedAt = Date.now();
  return entry.fields.get(field);
}

export function hmget(ctx: StorageContext, key: string, fields: string[]): (string | undefined)[] {
  if (ctx.checkExpired(key)) return fields.map(() => undefined);

  const entry = ctx.data.get(key);
  if (!entry) return fields.map(() => undefined);
  if (entry.type !== "hash") {
    throw new Error(ERR_WRONG_TYPE);
  }

  entry.lastAccessedAt = Date.now();
  return fields.map((f) => entry.fields.get(f));
}

export function hdel(ctx: StorageContext, key: string, fields: string[]): number {
  const entry = getValidEntry(ctx, key, "hash");
  if (!entry) return 0;

  const oldBytes = calculateEntryBytes(key, entry);
  let removed = 0;

  for (const f of fields) {
    if (entry.fields.delete(f)) {
      removed++;
    }
  }

  if (removed > 0) {
    shrinkOrDeleteEntry(ctx, key, entry, oldBytes, entry.fields.size === 0);
  }

  return removed;
}

export function hexists(ctx: StorageContext, key: string, field: string): boolean {
  const entry = getValidEntry(ctx, key, "hash");
  if (!entry) return false;
  entry.lastAccessedAt = Date.now();
  return entry.fields.has(field);
}

export function hlen(ctx: StorageContext, key: string): number {
  const entry = getValidEntry(ctx, key, "hash");
  if (!entry) return 0;
  entry.lastAccessedAt = Date.now();
  return entry.fields.size;
}

export function hgetall(ctx: StorageContext, key: string): [string, string][] {
  const entry = getValidEntry(ctx, key, "hash");
  if (!entry) return [];
  entry.lastAccessedAt = Date.now();

  const pairs: [string, string][] = [];
  for (const [k, v] of entry.fields) {
    pairs.push([k, v]);
  }
  return pairs;
}

export function hkeys(ctx: StorageContext, key: string): string[] {
  const entry = getValidEntry(ctx, key, "hash");
  if (!entry) return [];
  entry.lastAccessedAt = Date.now();
  return Array.from(entry.fields.keys());
}

export function hvals(ctx: StorageContext, key: string): string[] {
  const entry = getValidEntry(ctx, key, "hash");
  if (!entry) return [];
  entry.lastAccessedAt = Date.now();
  return Array.from(entry.fields.values());
}
