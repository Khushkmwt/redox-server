// String collection operations for Redox store.

import type { StorageContext } from "../context.js";
import type { StringEntry } from "../types.js";
import { calculateEntryBytes } from "../memory.js";
import { ERR_WRONG_TYPE } from "../../utils/constants.js";
import { isWithinInt64 } from "../../utils/validators.js";
import { getValidEntry } from "./common.js";

export function set(
  ctx: StorageContext,
  key: string,
  value: string,
  ttlMs?: number,
  keepTtl = false
): void {
  ctx.checkExpired(key);

  const now = Date.now();
  const oldEntry = ctx.data.get(key);
  let expiresAt: number | undefined;

  if (keepTtl) {
    expiresAt = oldEntry?.expiresAt;
  } else {
    expiresAt = ttlMs !== undefined ? now + ttlMs : undefined;
  }

  const newEntry: StringEntry = { type: "string", value, lastAccessedAt: now, expiresAt };
  const newBytes = calculateEntryBytes(key, newEntry);
  const oldBytes = oldEntry ? calculateEntryBytes(key, oldEntry) : 0;
  const delta = newBytes - oldBytes;

  ctx.ensureMemory(delta, key);

  ctx.data.set(key, newEntry);
  if (expiresAt !== undefined) {
    ctx.ttlKeys.add(key);
  } else {
    ctx.ttlKeys.delete(key);
  }
  ctx.adjustMemory(delta);
}

export function mset(ctx: StorageContext, pairs: [string, string][]): void {
  const now = Date.now();
  const finalEntries = new Map<string, StringEntry>();

  for (const [key, value] of pairs) {
    ctx.checkExpired(key);
    finalEntries.set(key, { type: "string", value, lastAccessedAt: now });
  }

  let netDelta = 0;
  const excludeKeys = new Set<string>();

  for (const [key, newEntry] of finalEntries) {
    excludeKeys.add(key);
    const newBytes = calculateEntryBytes(key, newEntry);
    const oldEntry = ctx.data.get(key);
    const oldBytes = oldEntry ? calculateEntryBytes(key, oldEntry) : 0;
    netDelta += newBytes - oldBytes;
  }

  ctx.ensureMemory(netDelta, excludeKeys);

  for (const [key, newEntry] of finalEntries) {
    ctx.data.set(key, newEntry);
    ctx.ttlKeys.delete(key);
  }
  ctx.adjustMemory(netDelta);
}

export function get(ctx: StorageContext, key: string): string | undefined {
  const entry = getValidEntry(ctx, key, "string");
  if (!entry) return undefined;
  entry.lastAccessedAt = Date.now();
  return entry.value;
}

export function append(ctx: StorageContext, key: string, value: string): number {
  ctx.checkExpired(key);

  const entry = ctx.data.get(key);
  if (!entry) {
    set(ctx, key, value);
    return Buffer.byteLength(value, "utf8");
  }

  if (entry.type !== "string") {
    throw new Error(ERR_WRONG_TYPE);
  }

  const oldBytes = calculateEntryBytes(key, entry);
  const appended = entry.value + value;
  const newEntry: StringEntry = {
    ...entry,
    value: appended,
    lastAccessedAt: Date.now(),
  };
  const newBytes = calculateEntryBytes(key, newEntry);
  const delta = newBytes - oldBytes;

  ctx.ensureMemory(delta, key);

  ctx.data.set(key, newEntry);
  ctx.adjustMemory(delta);

  return Buffer.byteLength(appended, "utf8");
}

export function strlen(ctx: StorageContext, key: string): number {
  const entry = getValidEntry(ctx, key, "string");
  if (!entry) return 0;
  entry.lastAccessedAt = Date.now();
  return Buffer.byteLength(entry.value, "utf8");
}

export function incrby(ctx: StorageContext, key: string, amount: bigint): bigint {
  ctx.checkExpired(key);

  const entry = ctx.data.get(key);
  let currentVal = 0n;

  if (entry) {
    if (entry.type !== "string") {
      throw new Error(ERR_WRONG_TYPE);
    }
    try {
      currentVal = BigInt(entry.value);
    } catch {
      throw new Error("ERR value is not an integer or out of range");
    }
  }

  const nextVal = currentVal + amount;
  if (!isWithinInt64(nextVal)) {
    throw new Error("ERR increment or decrement would overflow");
  }

  set(ctx, key, nextVal.toString(), undefined, true);
  return nextVal;
}

export function decrby(ctx: StorageContext, key: string, amount: bigint): bigint {
  return incrby(ctx, key, -amount);
}
