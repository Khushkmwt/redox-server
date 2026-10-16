import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// PTTL key — returns remaining time to live in milliseconds
export function pttl(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'pttl' command");
  }

  const ms = store.pttl(args[0]);
  return encode.integer(ms);
}
