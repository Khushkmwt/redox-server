import type { Entry } from "./types.js";

export const KEY_OVERHEAD = 32;
export const HASH_FIELD_OVERHEAD = 16;

/**
 * Parse human memory strings like '64mb', '500kb', '1gb', or raw bytes.
 * Returns bytes as a number (0 = unlimited).
 */
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

/**
 * Format raw byte counts into clean human-readable strings (e.g. '1.50M', '500.00K').
 */
export function formatBytesHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}G`;
}

/**
 * Compute total estimated bytes used by a key and its entry.
 */
export function calculateEntryBytes(key: string, entry: Entry): number {
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
