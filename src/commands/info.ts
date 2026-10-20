import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// INFO [section] — reports server diagnostics, memory usage, and stats
export function info(args: string[], store: Store): Buffer {
  const result = store.info(args[0]);
  return encode.bulkString(result);
}
