import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// KEYS pattern — returns all keys matching pattern
export function keys(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'keys' command");
  }

  const matched = store.keys(args[0]);
  const items = matched.map((k) => encode.bulkString(k));
  return encode.array(items);
}
