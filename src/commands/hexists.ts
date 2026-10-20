import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HEXISTS key field
export function hexists(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return encode.error("ERR wrong number of arguments for 'hexists' command");
  }

  try {
    const exists = store.hexists(args[0], args[1]);
    return encode.integer(exists ? 1 : 0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
