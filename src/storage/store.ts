// In-memory key-value store coordinator.
// Orchestrates keyspace lifecycle, memory budgeting, TTL expiry, and data types.

import {
  type Entry,
  type StringEntry,
  type HashEntry,
  type ListEntry,
  type SetEntry,
  type ValueType,
  type EvictionPolicy,
} from "./types.js";
import type { SnapshotEntry } from "../types/persistence.js";
import {
  calculateEntryBytes,
  parseMemoryString,
  formatBytesHuman,
} from "./memory.js";
import { globToRegExp } from "./pattern.js";
import { isEntryExpired, sweepActiveExpiry } from "./expiry.js";
import { evictForMemoryDelta } from "./eviction.js";
import { formatInfo } from "./diagnostics.js";
import type { StorageContext } from "./context.js";
import * as stringOps from "./collections/strings.js";
import * as hashOps from "./collections/hashes.js";
import * as listOps from "./collections/lists.js";
import * as setOps from "./collections/sets.js";
import * as ttlOps from "./collections/ttl.js";

class Store {
  private readonly data = new Map<string, Entry>();
  private usedMemory = 0;
  private evictedKeys = 0;
  private expiredKeys = 0;
  private expiryTimer: NodeJS.Timeout | null = null;

  public readonly startTime: number = Date.now();
  public lastSaveTimestamp: number = 0;
  public totalConnections: number = 0;
  public totalCommands: number = 0;

  public maxMemory: number = parseMemoryString(process.env.MAX_MEMORY);
  public evictionPolicy: EvictionPolicy =
    (process.env.EVICTION_POLICY?.toLowerCase() as EvictionPolicy) === "allkeys-lru"
      ? "allkeys-lru"
      : "noeviction";
  public port: number = Number(process.env.PORT ?? 6379);

  private ttlKeys = new Set<string>();

  private readonly ctx: StorageContext = {
    data: this.data,
    ttlKeys: this.ttlKeys,
    checkExpired: (key: string) => this.checkExpired(key),
    ensureMemory: (deltaBytes: number, excludeKeys?: string | Set<string>) =>
      this.ensureMemory(deltaBytes, excludeKeys),
    adjustMemory: (deltaBytes: number) => {
      this.usedMemory = Math.max(0, this.usedMemory + deltaBytes);
    },
    del: (...keys: string[]) => this.del(...keys),
  };

  constructor(options?: { maxMemoryBytes?: number; evictionPolicy?: EvictionPolicy; port?: number }) {
    if (options?.maxMemoryBytes !== undefined) {
      if (!Number.isFinite(options.maxMemoryBytes) || options.maxMemoryBytes < 0) {
        throw new Error(`Invalid maxMemoryBytes: '${options.maxMemoryBytes}'`);
      }
      this.maxMemory = options.maxMemoryBytes;
    }
    if (options?.evictionPolicy !== undefined) {
      if (options.evictionPolicy !== "noeviction" && options.evictionPolicy !== "allkeys-lru") {
        throw new Error(
          `Invalid evictionPolicy: '${options.evictionPolicy}'. Must be 'noeviction' or 'allkeys-lru'`
        );
      }
      this.evictionPolicy = options.evictionPolicy;
    }
    if (options?.port !== undefined) {
      this.port = options.port;
    }
    this.startActiveExpiry();
  }

  get usedMemoryBytes(): number {
    return this.usedMemory;
  }

  get evictedKeysCount(): number {
    return this.evictedKeys;
  }

  get expiredKeysCount(): number {
    return this.expiredKeys;
  }

  // --- Expiration Lifecycle ---

  private checkExpired(key: string): boolean {
    const entry = this.data.get(key);
    if (!isEntryExpired(entry)) return false;

    const bytes = calculateEntryBytes(key, entry!);
    this.data.delete(key);
    this.ttlKeys.delete(key);
    this.usedMemory = Math.max(0, this.usedMemory - bytes);
    this.expiredKeys++;
    return true;
  }

  public startActiveExpiry(intervalMs = 100): void {
    if (this.expiryTimer) return;
    this.expiryTimer = setInterval(() => {
      this.activeExpiryTick();
    }, intervalMs);
    this.expiryTimer.unref();
  }

  public stopActiveExpiry(): void {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  public activeExpiryTick(): number {
    const { purgedCount, freedBytes } = sweepActiveExpiry(this.data, this.ttlKeys);
    this.usedMemory = Math.max(0, this.usedMemory - freedBytes);
    this.expiredKeys += purgedCount;
    return purgedCount;
  }

  private ensureMemory(deltaBytes: number, excludeKeys?: string | Set<string>): void {
    const { freedBytes, evictedCount } = evictForMemoryDelta(
      this.data,
      this.ttlKeys,
      this.usedMemory,
      this.maxMemory,
      deltaBytes,
      this.evictionPolicy,
      excludeKeys
    );
    this.usedMemory = Math.max(0, this.usedMemory - freedBytes);
    this.evictedKeys += evictedCount;
  }

  // --- String operations ---

  set(key: string, value: string, ttlMs?: number, keepTtl?: boolean): void {
    stringOps.set(this.ctx, key, value, ttlMs, keepTtl);
  }

  mset(pairs: [string, string][]): void {
    stringOps.mset(this.ctx, pairs);
  }

  get(key: string): string | undefined {
    return stringOps.get(this.ctx, key);
  }

  append(key: string, value: string): number {
    return stringOps.append(this.ctx, key, value);
  }

  strlen(key: string): number {
    return stringOps.strlen(this.ctx, key);
  }

  incr(key: string): bigint {
    return stringOps.incrby(this.ctx, key, 1n);
  }

  incrby(key: string, amount: bigint): bigint {
    return stringOps.incrby(this.ctx, key, amount);
  }

  decr(key: string): bigint {
    return stringOps.decrby(this.ctx, key, 1n);
  }

  decrby(key: string, amount: bigint): bigint {
    return stringOps.decrby(this.ctx, key, amount);
  }

  // --- TTL operations ---

  expire(key: string, seconds: number): boolean {
    return ttlOps.expire(this.ctx, key, seconds);
  }

  pexpire(key: string, milliseconds: number): boolean {
    return ttlOps.pexpire(this.ctx, key, milliseconds);
  }

  ttl(key: string): number {
    return ttlOps.ttl(this.ctx, key);
  }

  pttl(key: string): number {
    return ttlOps.pttl(this.ctx, key);
  }

  persist(key: string): boolean {
    return ttlOps.persist(this.ctx, key);
  }

  // --- Hash operations ---

  hset(key: string, fieldPairs: [string, string][]): number {
    return hashOps.hset(this.ctx, key, fieldPairs);
  }

  hget(key: string, field: string): string | undefined {
    return hashOps.hget(this.ctx, key, field);
  }

  hmget(key: string, fields: string[]): (string | undefined)[] {
    return hashOps.hmget(this.ctx, key, fields);
  }

  hdel(key: string, fields: string[]): number {
    return hashOps.hdel(this.ctx, key, fields);
  }

  hexists(key: string, field: string): boolean {
    return hashOps.hexists(this.ctx, key, field);
  }

  hlen(key: string): number {
    return hashOps.hlen(this.ctx, key);
  }

  hgetall(key: string): [string, string][] {
    return hashOps.hgetall(this.ctx, key);
  }

  hkeys(key: string): string[] {
    return hashOps.hkeys(this.ctx, key);
  }

  hvals(key: string): string[] {
    return hashOps.hvals(this.ctx, key);
  }

  // --- List operations ---

  lpush(key: string, values: string[]): number {
    return listOps.lpush(this.ctx, key, values);
  }

  rpush(key: string, values: string[]): number {
    return listOps.rpush(this.ctx, key, values);
  }

  lpop(key: string, count?: number): string | string[] | null {
    return listOps.lpop(this.ctx, key, count);
  }

  rpop(key: string, count?: number): string | string[] | null {
    return listOps.rpop(this.ctx, key, count);
  }

  lrange(key: string, start: number, stop: number): string[] {
    return listOps.lrange(this.ctx, key, start, stop);
  }

  llen(key: string): number {
    return listOps.llen(this.ctx, key);
  }

  // --- Set operations ---

  sadd(key: string, members: string[]): number {
    return setOps.sadd(this.ctx, key, members);
  }

  srem(key: string, members: string[]): number {
    return setOps.srem(this.ctx, key, members);
  }

  smembers(key: string): string[] {
    return setOps.smembers(this.ctx, key);
  }

  sismember(key: string, member: string): boolean {
    return setOps.sismember(this.ctx, key, member);
  }

  scard(key: string): number {
    return setOps.scard(this.ctx, key);
  }

  // --- Keyspace operations ---

  del(...keys: string[]): number {
    let removed = 0;
    for (const key of keys) {
      if (this.checkExpired(key)) continue;
      const entry = this.data.get(key);
      if (entry) {
        const bytes = calculateEntryBytes(key, entry);
        this.data.delete(key);
        this.ttlKeys.delete(key);
        this.usedMemory = Math.max(0, this.usedMemory - bytes);
        removed++;
      }
    }
    return removed;
  }

  exists(...keys: string[]): number {
    let count = 0;
    for (const key of keys) {
      if (!this.checkExpired(key) && this.data.has(key)) count++;
    }
    return count;
  }

  type(key: string): ValueType | "none" {
    if (this.checkExpired(key)) return "none";
    const entry = this.data.get(key);
    if (!entry) return "none";
    return entry.type;
  }

  keys(pattern = "*"): string[] {
    const isWildcard = pattern === "*";
    const regex = isWildcard ? null : globToRegExp(pattern);
    const result: string[] = [];

    for (const key of this.data.keys()) {
      if (this.checkExpired(key)) continue;
      if (isWildcard || regex!.test(key)) {
        result.push(key);
      }
    }
    return result;
  }

  size(): number {
    return this.data.size;
  }

  flushAll(): void {
    this.data.clear();
    this.ttlKeys.clear();
    this.usedMemory = 0;
    this.evictedKeys = 0;
    this.expiredKeys = 0;
  }

  /**
   * Export snapshot entries directly without touching LRU lastAccessedAt (R5).
   */
  exportSnapshotEntries(): SnapshotEntry[] {
    const entries: SnapshotEntry[] = [];
    const now = Date.now();

    for (const [key, entry] of this.data.entries()) {
      if (this.checkExpired(key)) continue;

      const ttlMsRemaining =
        entry.expiresAt !== undefined && entry.expiresAt > now
          ? entry.expiresAt - now
          : undefined;

      if (entry.type === "string") {
        entries.push({ key, type: "string", value: entry.value, ttlMsRemaining });
      } else if (entry.type === "hash") {
        entries.push({
          key,
          type: "hash",
          fields: Object.fromEntries(entry.fields),
          ttlMsRemaining,
        });
      } else if (entry.type === "list") {
        entries.push({
          key,
          type: "list",
          elements: [...entry.elements],
          ttlMsRemaining,
        });
      } else if (entry.type === "set") {
        entries.push({
          key,
          type: "set",
          members: Array.from(entry.members),
          ttlMsRemaining,
        });
      }
    }
    return entries;
  }

  /**
   * Atomically replace this store's contents with another store's contents (R3).
   */
  replaceStoreState(other: Store): void {
    this.data.clear();
    for (const [k, v] of other.data.entries()) {
      this.data.set(k, v);
    }
    this.ttlKeys.clear();
    for (const k of other.ttlKeys) {
      this.ttlKeys.add(k);
    }
    this.usedMemory = other.usedMemory;
    this.evictedKeys = other.evictedKeys;
    this.expiredKeys = other.expiredKeys;
  }

  info(section?: string): string {
    return formatInfo(
      {
        startTime: this.startTime,
        port: this.port,
        usedMemory: this.usedMemory,
        maxMemory: this.maxMemory,
        evictionPolicy: this.evictionPolicy,
        evictedKeys: this.evictedKeys,
        expiredKeys: this.expiredKeys,
        totalKeys: this.data.size,
        lastSaveTimestamp: this.lastSaveTimestamp,
        totalConnections: this.totalConnections,
        totalCommands: this.totalCommands,
      },
      section
    );
  }
}

// Re-exports for clean modular access and full backward compatibility
export {
  type Entry,
  type StringEntry,
  type HashEntry,
  type ListEntry,
  type SetEntry,
  type ValueType,
  type EvictionPolicy,
  calculateEntryBytes,
  parseMemoryString,
  formatBytesHuman,
  globToRegExp,
};

export const store = new Store();
export { Store };
