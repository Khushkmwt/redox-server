// TTL and key expiration lifecycle handlers.

import type { Entry } from "./types.js";
import { calculateEntryBytes } from "./memory.js";
import { ACTIVE_EXPIRY_BATCH_SIZE } from "../utils/constants.js";

/**
 * Check if an entry has passed its expiration deadline.
 */
export function isEntryExpired(entry: Entry | undefined, now = Date.now()): boolean {
  if (!entry || entry.expiresAt === undefined) return false;
  return now >= entry.expiresAt;
}

/**
 * Perform one active expiry background sweep tick across keys with TTL.
 * Snapshots up to batchSize distinct keys to prevent inspecting the same key
 * multiple times in the same tick (R16).
 */
export function sweepActiveExpiry(
  data: Map<string, Entry>,
  ttlKeys: Set<string>,
  batchSize = ACTIVE_EXPIRY_BATCH_SIZE
): { purgedCount: number; freedBytes: number } {
  const now = Date.now();
  let purgedCount = 0;
  let freedBytes = 0;

  // Snapshot up to batchSize distinct keys
  const sample: string[] = [];
  for (const key of ttlKeys) {
    sample.push(key);
    if (sample.length >= batchSize) break;
  }

  for (const key of sample) {
    const entry = data.get(key);

    if (!entry || entry.expiresAt === undefined) {
      ttlKeys.delete(key);
    } else if (now >= entry.expiresAt) {
      const bytes = calculateEntryBytes(key, entry);
      data.delete(key);
      ttlKeys.delete(key);
      freedBytes += bytes;
      purgedCount++;
    } else {
      // Rotate visited key to the end of the Set so subsequent sweeps sample others
      ttlKeys.delete(key);
      ttlKeys.add(key);
    }
  }

  return { purgedCount, freedBytes };
}
