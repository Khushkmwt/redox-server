import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// TTL key — returns remaining time to live in seconds
export function ttl(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'ttl' command");
  }

  const seconds = store.ttl(args[0]);
  return encode.integer(seconds);
}
