import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// SCARD key
export function scard(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'scard' command");
  }

  try {
    const count = store.scard(args[0]);
    return encode.integer(count);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
