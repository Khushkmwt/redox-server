// TTL and expiration operations for keys.

import type { StorageContext } from "../context.js";

export function expire(ctx: StorageContext, key: string, seconds: number): boolean {
  return pexpire(ctx, key, seconds * 1000);
}

export function pexpire(ctx: StorageContext, key: string, milliseconds: number): boolean {
  if (ctx.checkExpired(key)) return false;

  const entry = ctx.data.get(key);
  if (!entry) return false;

  if (milliseconds <= 0) {
    ctx.del(key);
    return true;
  }

  entry.expiresAt = Date.now() + milliseconds;
  ctx.ttlKeys.add(key);
  return true;
}

export function ttl(ctx: StorageContext, key: string): number {
  const ms = pttl(ctx, key);
  if (ms < 0) return ms;
  return Math.ceil(ms / 1000);
}

export function pttl(ctx: StorageContext, key: string): number {
  if (ctx.checkExpired(key)) return -2;

  const entry = ctx.data.get(key);
  if (!entry) return -2;

  if (entry.expiresAt === undefined) return -1;

  const remaining = entry.expiresAt - Date.now();
  return remaining > 0 ? remaining : -2;
}

export function persist(ctx: StorageContext, key: string): boolean {
  if (ctx.checkExpired(key)) return false;

  const entry = ctx.data.get(key);
  if (!entry || entry.expiresAt === undefined) return false;

  delete entry.expiresAt;
  ctx.ttlKeys.delete(key);
  return true;
}
