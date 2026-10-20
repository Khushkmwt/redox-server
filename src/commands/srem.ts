import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// SREM key member [member ...]
export function srem(args: string[], store: Store): Buffer {
  if (args.length < 2) {
    return encode.error("ERR wrong number of arguments for 'srem' command");
  }

  const [key, ...members] = args;
  try {
    const removed = store.srem(key, members);
    return encode.integer(removed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
