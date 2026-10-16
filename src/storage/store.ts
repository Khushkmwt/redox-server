// In-memory key-value store coordinator.
// Orchestrates keyspace lifecycle, memory budgeting, TTL expiry, and data types.

import {
  type Entry,
  type StringEntry,
  type HashEntry,
  type ValueType,
  type EvictionPolicy,
} from "./types.js";
import {
  calculateEntryBytes,
  parseMemoryString,
  formatBytesHuman,
} from "./memory.js";
import { globToRegExp } from "./pattern.js";

class Store {
  private readonly data = new Map<string, Entry>();
  private usedMemory = 0;
  private evictedKeys = 0;
  private expiredKeys = 0;
  private expiryTimer: NodeJS.Timeout | null = null;

  public maxMemory: number = parseMemoryString(process.env.MAX_MEMORY);
  public evictionPolicy: EvictionPolicy =
    (process.env.EVICTION_POLICY?.toLowerCase() as EvictionPolicy) === "allkeys-lru"
      ? "allkeys-lru"
      : "noeviction";

  constructor() {
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

  /**
   * Passive (lazy) expiration check.
   * If key has expired, deletes it and returns true. Otherwise false.
   */
  private checkExpired(key: string): boolean {
    const entry = this.data.get(key);
    if (!entry || entry.expiresAt === undefined) return false;

    if (Date.now() >= entry.expiresAt) {
      const bytes = calculateEntryBytes(key, entry);
      this.data.delete(key);
      this.usedMemory = Math.max(0, this.usedMemory - bytes);
      this.expiredKeys++;
      return true;
    }

    return false;
  }

  /**
   * Active (background) expiration worker. Periodically samples keys with TTL.
   */
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
    const now = Date.now();
    let purged = 0;
    let checked = 0;

    for (const [key, entry] of this.data.entries()) {
      if (entry.expiresAt !== undefined) {
        checked++;
        if (now >= entry.expiresAt) {
          const bytes = calculateEntryBytes(key, entry);
          this.data.delete(key);
          this.usedMemory = Math.max(0, this.usedMemory - bytes);
          this.expiredKeys++;
          purged++;
        }
      }
      if (checked >= 20) break; // Sample max 20 keys per tick like Redis
    }

    return purged;
  }

  // --- Memory Enforcement ---

  private ensureMemory(deltaBytes: number): void {
    if (this.maxMemory <= 0 || deltaBytes <= 0) return;

    if (this.usedMemory + deltaBytes <= this.maxMemory) return;

    if (this.evictionPolicy === "noeviction") {
      throw new Error("OOM command not allowed when used memory > 'maxmemory'");
    }

    // allkeys-lru eviction loop
    while (this.usedMemory + deltaBytes > this.maxMemory && this.data.size > 0) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [k, entry] of this.data.entries()) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        const entry = this.data.get(oldestKey)!;
        const entryBytes = calculateEntryBytes(oldestKey, entry);
        this.data.delete(oldestKey);
        this.usedMemory = Math.max(0, this.usedMemory - entryBytes);
        this.evictedKeys++;
      } else {
        break;
      }
    }

    if (this.usedMemory + deltaBytes > this.maxMemory) {
      throw new Error("OOM command not allowed when used memory > 'maxmemory'");
    }
  }

  // --- String operations ---

  set(key: string, value: string, ttlMs?: number): void {
    this.checkExpired(key);

    const now = Date.now();
    const expiresAt = ttlMs !== undefined ? now + ttlMs : undefined;
    const newEntry: StringEntry = { type: "string", value, lastAccessedAt: now, expiresAt };
    const newBytes = calculateEntryBytes(key, newEntry);

    const oldEntry = this.data.get(key);
    const oldBytes = oldEntry ? calculateEntryBytes(key, oldEntry) : 0;
    const delta = newBytes - oldBytes;

    this.ensureMemory(delta);

    this.data.set(key, newEntry);
    this.usedMemory += delta;
  }

  get(key: string): string | undefined {
    if (this.checkExpired(key)) return undefined;

    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.type !== "string") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.value;
  }

  // --- TTL operations ---

  expire(key: string, seconds: number): boolean {
    return this.pexpire(key, seconds * 1000);
  }

  pexpire(key: string, milliseconds: number): boolean {
    if (this.checkExpired(key)) return false;

    const entry = this.data.get(key);
    if (!entry) return false;

    if (milliseconds <= 0) {
      this.del(key);
      return true;
    }

    entry.expiresAt = Date.now() + milliseconds;
    return true;
  }

  ttl(key: string): number {
    const ms = this.pttl(key);
    if (ms < 0) return ms;
    return Math.ceil(ms / 1000);
  }

  pttl(key: string): number {
    if (this.checkExpired(key)) return -2;

    const entry = this.data.get(key);
    if (!entry) return -2;

    if (entry.expiresAt === undefined) return -1;

    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : -2;
  }

  persist(key: string): boolean {
    if (this.checkExpired(key)) return false;

    const entry = this.data.get(key);
    if (!entry || entry.expiresAt === undefined) return false;

    delete entry.expiresAt;
    return true;
  }

  // --- Hash operations ---

  hset(key: string, fieldPairs: [string, string][]): number {
    this.checkExpired(key);

    const now = Date.now();
    let entry = this.data.get(key);

    if (entry && entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }

    let createdCount = 0;
    const oldBytes = entry ? calculateEntryBytes(key, entry) : 0;
    const expiresAt = entry?.expiresAt;

    const fieldsMap = entry ? new Map(entry.fields) : new Map<string, string>();

    for (const [f, v] of fieldPairs) {
      if (!fieldsMap.has(f)) {
        createdCount++;
      }
      fieldsMap.set(f, v);
    }

    const newEntry: HashEntry = { type: "hash", fields: fieldsMap, lastAccessedAt: now, expiresAt };
    const newBytes = calculateEntryBytes(key, newEntry);
    const delta = newBytes - oldBytes;

    this.ensureMemory(delta);

    this.data.set(key, newEntry);
    this.usedMemory += delta;

    return createdCount;
  }

  hget(key: string, field: string): string | undefined {
    if (this.checkExpired(key)) return undefined;

    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.fields.get(field);
  }

  hmget(key: string, fields: string[]): (string | undefined)[] {
    if (this.checkExpired(key)) return fields.map(() => undefined);

    const entry = this.data.get(key);
    if (entry && entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    if (entry) {
      entry.lastAccessedAt = Date.now();
    }
    return fields.map((f) => (entry ? entry.fields.get(f) : undefined));
  }

  hdel(key: string, fields: string[]): number {
    if (this.checkExpired(key)) return 0;

    const entry = this.data.get(key);
    if (!entry) return 0;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }

    const oldBytes = calculateEntryBytes(key, entry);
    let removed = 0;

    for (const f of fields) {
      if (entry.fields.delete(f)) {
        removed++;
      }
    }

    if (removed > 0) {
      if (entry.fields.size === 0) {
        this.data.delete(key);
        this.usedMemory = Math.max(0, this.usedMemory - oldBytes);
      } else {
        const newBytes = calculateEntryBytes(key, entry);
        this.usedMemory = Math.max(0, this.usedMemory - (oldBytes - newBytes));
        entry.lastAccessedAt = Date.now();
      }
    }

    return removed;
  }

  hexists(key: string, field: string): boolean {
    if (this.checkExpired(key)) return false;

    const entry = this.data.get(key);
    if (!entry) return false;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.fields.has(field);
  }

  hlen(key: string): number {
    if (this.checkExpired(key)) return 0;

    const entry = this.data.get(key);
    if (!entry) return 0;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.fields.size;
  }

  hgetall(key: string): [string, string][] {
    if (this.checkExpired(key)) return [];

    const entry = this.data.get(key);
    if (!entry) return [];
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return Array.from(entry.fields.entries());
  }

  hkeys(key: string): string[] {
    if (this.checkExpired(key)) return [];

    const entry = this.data.get(key);
    if (!entry) return [];
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return Array.from(entry.fields.keys());
  }

  hvals(key: string): string[] {
    if (this.checkExpired(key)) return [];

    const entry = this.data.get(key);
    if (!entry) return [];
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return Array.from(entry.fields.values());
  }

  // --- Keyspace operations ---

  del(...keys: string[]): number {
    let removed = 0;
    for (const key of keys) {
      const entry = this.data.get(key);
      if (entry) {
        const bytes = calculateEntryBytes(key, entry);
        this.data.delete(key);
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

  type(key: string): "string" | "hash" | "none" {
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
    for (const key of this.data.keys()) {
      this.checkExpired(key);
    }
    return this.data.size;
  }

  flushAll(): void {
    this.data.clear();
    this.usedMemory = 0;
    this.evictedKeys = 0;
    this.expiredKeys = 0;
  }

  info(section?: string): string {
    const sec = section?.toLowerCase();
    const lines: string[] = [];

    if (!sec || sec === "memory") {
      lines.push("# Memory");
      lines.push(`used_memory:${this.usedMemory}`);
      lines.push(`used_memory_human:${formatBytesHuman(this.usedMemory)}`);
      lines.push(`maxmemory:${this.maxMemory}`);
      lines.push(`maxmemory_human:${formatBytesHuman(this.maxMemory)}`);
      lines.push(`maxmemory_policy:${this.evictionPolicy}`);
      lines.push(`evicted_keys:${this.evictedKeys}`);
      lines.push(`expired_keys:${this.expiredKeys}`);
      lines.push(`total_keys:${this.data.size}`);
    }

    return lines.join("\r\n");
  }
}

// Re-exports for clean modular access and full backward compatibility
export {
  type Entry,
  type StringEntry,
  type HashEntry,
  type ValueType,
  type EvictionPolicy,
  calculateEntryBytes,
  parseMemoryString,
  formatBytesHuman,
  globToRegExp,
};

export const store = new Store();
export type { Store };
