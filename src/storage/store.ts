// In-memory key-value store with real-time memory tracking,
// LRU eviction, and support for Strings and Hashes.

export type ValueType = "string" | "hash";

export interface StringEntry {
  type: "string";
  value: string;
  lastAccessedAt: number;
}

export interface HashEntry {
  type: "hash";
  fields: Map<string, string>;
  lastAccessedAt: number;
}

export type Entry = StringEntry | HashEntry;

export type EvictionPolicy = "noeviction" | "allkeys-lru";

const KEY_OVERHEAD = 32;
const HASH_FIELD_OVERHEAD = 16;

export function parseMemoryString(memStr?: string): number {
  if (!memStr) return 0;
  const match = memStr.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2] || "b";
  switch (unit) {
    case "kb":
      return Math.round(num * 1024);
    case "mb":
      return Math.round(num * 1024 * 1024);
    case "gb":
      return Math.round(num * 1024 * 1024 * 1024);
    default:
      return Math.round(num);
  }
}

export function formatBytesHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}G`;
}

class Store {
  private readonly data = new Map<string, Entry>();
  private usedMemory = 0;
  private evictedKeys = 0;

  public maxMemory: number = parseMemoryString(process.env.MAX_MEMORY);
  public evictionPolicy: EvictionPolicy =
    (process.env.EVICTION_POLICY?.toLowerCase() as EvictionPolicy) === "allkeys-lru"
      ? "allkeys-lru"
      : "noeviction";

  get usedMemoryBytes(): number {
    return this.usedMemory;
  }

  get evictedKeysCount(): number {
    return this.evictedKeys;
  }

  private calculateEntryBytes(key: string, entry: Entry): number {
    const keyBytes = Buffer.byteLength(key, "utf8") + KEY_OVERHEAD;
    if (entry.type === "string") {
      return keyBytes + Buffer.byteLength(entry.value, "utf8");
    }
    let total = keyBytes;
    for (const [f, v] of entry.fields.entries()) {
      total += Buffer.byteLength(f, "utf8") + Buffer.byteLength(v, "utf8") + HASH_FIELD_OVERHEAD;
    }
    return total;
  }

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
        const entryBytes = this.calculateEntryBytes(oldestKey, entry);
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

  set(key: string, value: string): void {
    const now = Date.now();
    const newEntry: StringEntry = { type: "string", value, lastAccessedAt: now };
    const newBytes = this.calculateEntryBytes(key, newEntry);

    const oldEntry = this.data.get(key);
    const oldBytes = oldEntry ? this.calculateEntryBytes(key, oldEntry) : 0;
    const delta = newBytes - oldBytes;

    this.ensureMemory(delta);

    this.data.set(key, newEntry);
    this.usedMemory += delta;
  }

  get(key: string): string | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.type !== "string") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.value;
  }

  // --- Hash operations ---

  hset(key: string, fieldPairs: [string, string][]): number {
    const now = Date.now();
    let entry = this.data.get(key);

    if (entry && entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }

    let createdCount = 0;
    const oldBytes = entry ? this.calculateEntryBytes(key, entry) : 0;

    const fieldsMap = entry ? new Map(entry.fields) : new Map<string, string>();

    for (const [f, v] of fieldPairs) {
      if (!fieldsMap.has(f)) {
        createdCount++;
      }
      fieldsMap.set(f, v);
    }

    const newEntry: HashEntry = { type: "hash", fields: fieldsMap, lastAccessedAt: now };
    const newBytes = this.calculateEntryBytes(key, newEntry);
    const delta = newBytes - oldBytes;

    this.ensureMemory(delta);

    this.data.set(key, newEntry);
    this.usedMemory += delta;

    return createdCount;
  }

  hget(key: string, field: string): string | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.fields.get(field);
  }

  hmget(key: string, fields: string[]): (string | undefined)[] {
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
    const entry = this.data.get(key);
    if (!entry) return 0;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }

    const oldBytes = this.calculateEntryBytes(key, entry);
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
        const newBytes = this.calculateEntryBytes(key, entry);
        this.usedMemory = Math.max(0, this.usedMemory - (oldBytes - newBytes));
        entry.lastAccessedAt = Date.now();
      }
    }

    return removed;
  }

  hexists(key: string, field: string): boolean {
    const entry = this.data.get(key);
    if (!entry) return false;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.fields.has(field);
  }

  hlen(key: string): number {
    const entry = this.data.get(key);
    if (!entry) return 0;
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return entry.fields.size;
  }

  hgetall(key: string): [string, string][] {
    const entry = this.data.get(key);
    if (!entry) return [];
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return Array.from(entry.fields.entries());
  }

  hkeys(key: string): string[] {
    const entry = this.data.get(key);
    if (!entry) return [];
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return Array.from(entry.fields.keys());
  }

  hvals(key: string): string[] {
    const entry = this.data.get(key);
    if (!entry) return [];
    if (entry.type !== "hash") {
      throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    }
    entry.lastAccessedAt = Date.now();
    return Array.from(entry.fields.values());
  }

  // --- Common keyspace operations ---

  del(...keys: string[]): number {
    let removed = 0;
    for (const key of keys) {
      const entry = this.data.get(key);
      if (entry) {
        const bytes = this.calculateEntryBytes(key, entry);
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
      if (this.data.has(key)) count++;
    }
    return count;
  }

  type(key: string): "string" | "hash" | "none" {
    const entry = this.data.get(key);
    if (!entry) return "none";
    return entry.type;
  }

  keys(pattern = "*"): string[] {
    if (pattern === "*") {
      return Array.from(this.data.keys());
    }
    const regex = globToRegExp(pattern);
    const result: string[] = [];
    for (const key of this.data.keys()) {
      if (regex.test(key)) {
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
    this.usedMemory = 0;
    this.evictedKeys = 0;
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
      lines.push(`total_keys:${this.data.size}`);
    }

    return lines.join("\r\n");
  }
}

/** Convert a Redis glob pattern to a JavaScript RegExp. */
export function globToRegExp(pattern: string): RegExp {
  let regexStr = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      regexStr += ".*";
    } else if (c === "?") {
      regexStr += ".";
    } else if (c === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close !== -1) {
        const inner = pattern.slice(i + 1, close);
        regexStr += `[${inner.replace(/\\/g, "\\\\")}]`;
        i = close;
      } else {
        regexStr += "\\[";
      }
    } else if ("\\.+*?^$()[]{}|".includes(c)) {
      regexStr += `\\${c}`;
    } else {
      regexStr += c;
    }
  }
  regexStr += "$";
  return new RegExp(regexStr);
}

export const store = new Store();
export type { Store };
