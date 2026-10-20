import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// LPUSH key value [value ...]
export function lpush(args: string[], store: Store): Buffer {
  if (args.length < 2) {
    return encode.error("ERR wrong number of arguments for 'lpush' command");
  }

  const [key, ...values] = args;
  try {
    const len = store.lpush(key, values);
    return encode.integer(len);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
