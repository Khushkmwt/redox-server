// Data structure definitions for the in-memory keyspace.

export type ValueType = "string" | "hash";

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

export type Entry = StringEntry | HashEntry;

export type EvictionPolicy = "noeviction" | "allkeys-lru";
