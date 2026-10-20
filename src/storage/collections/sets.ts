// Set collection operations for Redox store.

import type { StorageContext } from "../context.js";
import type { SetEntry } from "../types.js";
import { calculateEntryBytes } from "../memory.js";
import { ERR_WRONG_TYPE } from "../../utils/constants.js";
import { getValidEntry, commitEntry, shrinkOrDeleteEntry } from "./common.js";

export function sadd(ctx: StorageContext, key: string, members: string[]): number {
  ctx.checkExpired(key);

  const entry = ctx.data.get(key);
  if (entry && entry.type !== "set") {
    throw new Error(ERR_WRONG_TYPE);
  }

  let addedCount = 0;
  const setMembers = entry ? new Set(entry.members) : new Set<string>();

  for (const m of members) {
    if (!setMembers.has(m)) {
      setMembers.add(m);
      addedCount++;
    }
  }

  const newEntry: SetEntry = {
    type: "set",
    members: setMembers,
    lastAccessedAt: Date.now(),
    expiresAt: entry?.expiresAt,
  };

  commitEntry(ctx, key, newEntry, entry);
  return addedCount;
}

export function srem(ctx: StorageContext, key: string, members: string[]): number {
  const entry = getValidEntry(ctx, key, "set");
  if (!entry) return 0;

  const oldBytes = calculateEntryBytes(key, entry);
  let removed = 0;

  for (const m of members) {
    if (entry.members.delete(m)) {
      removed++;
    }
  }

  if (removed > 0) {
    shrinkOrDeleteEntry(ctx, key, entry, oldBytes, entry.members.size === 0);
  }

  return removed;
}

export function smembers(ctx: StorageContext, key: string): string[] {
  const entry = getValidEntry(ctx, key, "set");
  if (!entry) return [];
  entry.lastAccessedAt = Date.now();
  return Array.from(entry.members);
}

export function sismember(ctx: StorageContext, key: string, member: string): boolean {
  const entry = getValidEntry(ctx, key, "set");
  if (!entry) return false;
  entry.lastAccessedAt = Date.now();
  return entry.members.has(member);
}

export function scard(ctx: StorageContext, key: string): number {
  const entry = getValidEntry(ctx, key, "set");
  if (!entry) return 0;
  entry.lastAccessedAt = Date.now();
  return entry.members.size;
}
