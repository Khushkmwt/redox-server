import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// LLEN key
export function llen(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'llen' command");
  }

  try {
    const len = store.llen(args[0]);
    return encode.integer(len);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
