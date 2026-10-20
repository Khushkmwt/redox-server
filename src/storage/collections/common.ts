// Common collection utilities for Redox storage engine.

import type { StorageContext } from "../context.js";
import type { Entry, ValueType } from "../types.js";
import { calculateEntryBytes } from "../memory.js";
import { ERR_WRONG_TYPE } from "../../utils/constants.js";

/**
 * Type-safe retrieval of an entry from the store.
 * Checks for expiration and validates that the entry matches expectedType.
 * Throws ERR_WRONG_TYPE if the entry exists under a different type.
 */
export function getValidEntry<T extends ValueType>(
  ctx: StorageContext,
  key: string,
  expectedType: T
): (Entry & { type: T }) | undefined {
  if (ctx.checkExpired(key)) return undefined;

  const entry = ctx.data.get(key);
  if (!entry) return undefined;

  if (entry.type !== expectedType) {
    throw new Error(ERR_WRONG_TYPE);
  }

  return entry as Entry & { type: T };
}

/**
 * Inserts or updates an entry, handling memory delta accounting, eviction, and TTL indexing.
 */
export function commitEntry(
  ctx: StorageContext,
  key: string,
  newEntry: Entry,
  oldEntry?: Entry
): void {
  const oldBytes = oldEntry ? calculateEntryBytes(key, oldEntry) : 0;
  const newBytes = calculateEntryBytes(key, newEntry);
  const delta = newBytes - oldBytes;

  ctx.ensureMemory(delta, key);

  ctx.data.set(key, newEntry);
  if (newEntry.expiresAt !== undefined) {
    ctx.ttlKeys.add(key);
  }
  ctx.adjustMemory(delta);
}

/**
 * Fully removes an entry and cleans up memory accounting and TTL tracking.
 */
export function deleteEntry(
  ctx: StorageContext,
  key: string,
  oldEntry?: Entry
): void {
  const target = oldEntry ?? ctx.data.get(key);
  if (!target) return;

  const oldBytes = calculateEntryBytes(key, target);
  ctx.data.delete(key);
  ctx.ttlKeys.delete(key);
  ctx.adjustMemory(-oldBytes);
}

/**
 * Adjusts memory for an in-place mutation of an entry (e.g. popping or removing items).
 * If the collection is now empty, fully deletes the key and cleans up its TTL.
 */
export function shrinkOrDeleteEntry(
  ctx: StorageContext,
  key: string,
  entry: Entry,
  oldBytes: number,
  isEmpty: boolean
): void {
  if (isEmpty) {
    ctx.data.delete(key);
    ctx.ttlKeys.delete(key);
    ctx.adjustMemory(-oldBytes);
  } else {
    const newBytes = calculateEntryBytes(key, entry);
    ctx.adjustMemory(-(oldBytes - newBytes));
    entry.lastAccessedAt = Date.now();
  }
}
