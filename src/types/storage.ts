export type ValueType = "string" | "hash" | "list" | "set";

export interface StringEntry {
  type: "string";
  value: string;
  lastAccessedAt: number;
  expiresAt?: number;
}

export interface HashEntry {
  type: "hash";
  fields: Map<string, string>;
  lastAccessedAt: number;
  expiresAt?: number;
}

export interface ListEntry {
  type: "list";
  elements: string[];
  lastAccessedAt: number;
  expiresAt?: number;
}

export interface SetEntry {
  type: "set";
  members: Set<string>;
  lastAccessedAt: number;
  expiresAt?: number;
}

export type Entry = StringEntry | HashEntry | ListEntry | SetEntry;

export type EvictionPolicy = "noeviction" | "allkeys-lru";

export interface StoreOptions {
  maxMemoryBytes?: number;
  evictionPolicy?: EvictionPolicy;
  port?: number;
}
