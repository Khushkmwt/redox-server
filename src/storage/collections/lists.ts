// List collection operations for Redox store.

import type { StorageContext } from "../context.js";
import type { ListEntry } from "../types.js";
import { calculateEntryBytes } from "../memory.js";
import { ERR_WRONG_TYPE } from "../../utils/constants.js";
import { getValidEntry, commitEntry, deleteEntry, shrinkOrDeleteEntry } from "./common.js";

function pushList(
  ctx: StorageContext,
  key: string,
  values: string[],
  direction: "left" | "right"
): number {
  ctx.checkExpired(key);

  const entry = ctx.data.get(key);
  if (entry && entry.type !== "list") {
    throw new Error(ERR_WRONG_TYPE);
  }
  if (values.length === 0) {
    return entry ? entry.elements.length : 0;
  }

  const existing = entry ? entry.elements : [];
  const newElements =
    direction === "left"
      ? [...values.slice().reverse(), ...existing]
      : [...existing, ...values];

  const newEntry: ListEntry = {
    type: "list",
    elements: newElements,
    lastAccessedAt: Date.now(),
    expiresAt: entry?.expiresAt,
  };

  commitEntry(ctx, key, newEntry, entry);
  return newElements.length;
}

function popList(
  ctx: StorageContext,
  key: string,
  count: number | undefined,
  direction: "left" | "right"
): string | string[] | null {
  const entry = getValidEntry(ctx, key, "list");
  if (!entry) return null;

  const oldBytes = calculateEntryBytes(key, entry);

  if (count === undefined) {
    if (entry.elements.length === 0) {
      deleteEntry(ctx, key, entry);
      return null;
    }

    const popped = direction === "left" ? entry.elements.shift()! : entry.elements.pop()!;
    shrinkOrDeleteEntry(ctx, key, entry, oldBytes, entry.elements.length === 0);
    return popped;
  }

  if (count <= 0) return [];

  const numToPop = Math.min(count, entry.elements.length);
  const popped =
    direction === "left"
      ? entry.elements.splice(0, numToPop)
      : entry.elements.splice(entry.elements.length - numToPop, numToPop).reverse();

  shrinkOrDeleteEntry(ctx, key, entry, oldBytes, entry.elements.length === 0);
  return popped;
}

export function lpush(ctx: StorageContext, key: string, values: string[]): number {
  return pushList(ctx, key, values, "left");
}

export function rpush(ctx: StorageContext, key: string, values: string[]): number {
  return pushList(ctx, key, values, "right");
}

export function lpop(ctx: StorageContext, key: string, count?: number): string | string[] | null {
  return popList(ctx, key, count, "left");
}

export function rpop(ctx: StorageContext, key: string, count?: number): string | string[] | null {
  return popList(ctx, key, count, "right");
}

export function lrange(ctx: StorageContext, key: string, start: number, stop: number): string[] {
  const entry = getValidEntry(ctx, key, "list");
  if (!entry) return [];
  entry.lastAccessedAt = Date.now();

  const len = entry.elements.length;
  if (len === 0) return [];

  let normStart = start < 0 ? len + start : start;
  let normStop = stop < 0 ? len + stop : stop;

  if (normStart < 0) normStart = 0;
  if (normStop >= len) normStop = len - 1;

  if (normStart > normStop || normStart >= len) {
    return [];
  }

  return entry.elements.slice(normStart, normStop + 1);
}

export function llen(ctx: StorageContext, key: string): number {
  const entry = getValidEntry(ctx, key, "list");
  if (!entry) return 0;
  entry.lastAccessedAt = Date.now();
  return entry.elements.length;
}
