import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// EXPIRE key seconds
export function expire(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return encode.error("ERR wrong number of arguments for 'expire' command");
  }

  const seconds = parseInt(args[1], 10);
  if (isNaN(seconds)) {
    return encode.error("ERR value is not an integer or out of range");
  }

  const ok = store.expire(args[0], seconds);
  return encode.integer(ok ? 1 : 0);
}
