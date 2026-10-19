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

  constructor(options?: { maxMemoryBytes?: number; evictionPolicy?: EvictionPolicy; port?: number }) {
    if (options?.maxMemoryBytes !== undefined) {
      this.maxMemory = options.maxMemoryBytes;
    }
    if (options?.evictionPolicy !== undefined) {
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
      this.ttlKeys.delete(key);
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

    for (const key of this.ttlKeys) {
      checked++;
      const entry = this.data.get(key);
      if (!entry || entry.expiresAt === undefined) {
        this.ttlKeys.delete(key);
      } else if (now >= entry.expiresAt) {
        const bytes = calculateEntryBytes(key, entry);
        this.data.delete(key);
        this.ttlKeys.delete(key);
        this.usedMemory = Math.max(0, this.usedMemory - bytes);
        this.expiredKeys++;
        purged++;
      } else {
        // Rotate checked key to back of Set so subsequent ticks visit remaining keys
        this.ttlKeys.delete(key);
        this.ttlKeys.add(key);
      }
      if (checked >= 20) break;
    }

    return purged;
  }

  private ensureMemory(deltaBytes: number, excludeKeys?: string | Set<string>): void {
    if (this.maxMemory <= 0 || deltaBytes <= 0) return;

    if (deltaBytes > this.maxMemory) {
      throw new Error("OOM command not allowed when used memory > 'maxmemory'");
    }

    if (this.usedMemory + deltaBytes <= this.maxMemory) return;

    if (this.evictionPolicy === "noeviction") {
      throw new Error("OOM command not allowed when used memory > 'maxmemory'");
    }

    const excludeSet =
      excludeKeys instanceof Set
        ? excludeKeys
        : excludeKeys
          ? new Set([excludeKeys])
          : null;

    // allkeys-lru eviction loop
    while (
      this.usedMemory + deltaBytes > this.maxMemory &&
      this.data.size > (excludeSet?.size ?? 0)
    ) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      let sampleCount = 0;
      for (const [k, entry] of this.data.entries()) {
        if (excludeSet?.has(k)) continue;
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = k;
        }
        if (++sampleCount >= 16) break;
      }

      if (oldestKey) {
        const entry = this.data.get(oldestKey)!;
        const entryBytes = calculateEntryBytes(oldestKey, entry);
        this.data.delete(oldestKey);
        this.ttlKeys.delete(oldestKey);
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

  set(key: string, value: string, ttlMs?: number, keepTtl?: boolean): void {
    this.checkExpired(key);

    const now = Date.now();
    const oldEntry = this.data.get(key);
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

    this.ensureMemory(delta, key);

    this.data.set(key, newEntry);
    if (expiresAt !== undefined) {
      this.ttlKeys.add(key);
    } else {
      this.ttlKeys.delete(key);
    }
    this.usedMemory += delta;
  }

  mset(pairs: [string, string][]): void {
    const now = Date.now();
    const finalEntries = new Map<string, StringEntry>();

    for (const [key, value] of pairs) {
      this.checkExpired(key);
      finalEntries.set(key, { type: "string", value, lastAccessedAt: now });
    }

    let netDelta = 0;
    const excludeKeys = new Set<string>();

    for (const [key, newEntry] of finalEntries) {
      excludeKeys.add(key);
      const newBytes = calculateEntryBytes(key, newEntry);
      const oldEntry = this.data.get(key);
      const oldBytes = oldEntry ? calculateEntryBytes(key, oldEntry) : 0;
      netDelta += newBytes - oldBytes;
    }

    this.ensureMemory(netDelta, excludeKeys);

    for (const [key, newEntry] of finalEntries) {
      this.data.set(key, newEntry);
      this.ttlKeys.delete(key);
    }
    this.usedMemory += netDelta;
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
    this.ttlKeys.add(key);
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
    this.ttlKeys.delete(key);
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

    this.ensureMemory(delta, key);

    this.data.set(key, newEntry);
    if (expiresAt !== undefined) {
      this.ttlKeys.add(key);
    }
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
    return this.data.size;
  }

  flushAll(): void {
    this.data.clear();
    this.ttlKeys.clear();
    this.usedMemory = 0;
    this.evictedKeys = 0;
    this.expiredKeys = 0;
  }

  info(section?: string): string {
    const sec = section?.toLowerCase();
    const blocks: string[] = [];

    const serverSection = () => {
      const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
      return [
        "# Server",
        "redox_version:1.0.0",
        `process_id:${process.pid}`,
        `tcp_port:${this.port}`,
        `uptime_in_seconds:${uptimeSec}`,
      ].join("\r\n");
    };

    const memorySection = () => {
      return [
        "# Memory",
        `used_memory:${this.usedMemory}`,
        `used_memory_human:${formatBytesHuman(this.usedMemory)}`,
        `maxmemory:${this.maxMemory}`,
        `maxmemory_human:${formatBytesHuman(this.maxMemory)}`,
        `maxmemory_policy:${this.evictionPolicy}`,
        `evicted_keys:${this.evictedKeys}`,
        `expired_keys:${this.expiredKeys}`,
        `total_keys:${this.data.size}`,
      ].join("\r\n");
    };

    const persistenceSection = () => {
      return [
        "# Persistence",
        "loading:0",
        `rdb_last_save_time:${this.lastSaveTimestamp}`,
        "rdb_last_bgsave_status:ok",
      ].join("\r\n");
    };

    const statsSection = () => {
      return [
        "# Stats",
        `total_connections_received:${this.totalConnections}`,
        `total_commands_processed:${this.totalCommands}`,
      ].join("\r\n");
    };

    if (!sec || sec === "all" || sec === "default") {
      blocks.push(serverSection(), memorySection(), persistenceSection(), statsSection());
    } else if (sec === "server") {
      blocks.push(serverSection());
    } else if (sec === "memory") {
      blocks.push(memorySection());
    } else if (sec === "persistence") {
      blocks.push(persistenceSection());
    } else if (sec === "stats") {
      blocks.push(statsSection());
    }

    return blocks.join("\r\n\r\n");
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
export { Store };
