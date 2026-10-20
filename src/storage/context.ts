// Storage Context abstraction
// Provides collection operations with safe access to keyspace, memory budgeting, and lifecycle hooks.

import type { Entry } from "./types.js";

export interface StorageContext {
  readonly data: Map<string, Entry>;
  readonly ttlKeys: Set<string>;
  checkExpired(key: string): boolean;
  ensureMemory(deltaBytes: number, excludeKeys?: string | Set<string>): void;
  adjustMemory(deltaBytes: number): void;
  del(...keys: string[]): number;
}
