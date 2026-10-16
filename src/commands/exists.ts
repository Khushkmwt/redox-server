import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// EXISTS key [key ...]
export function exists(args: string[], store: Store): Buffer {
  if (args.length === 0)
    return encode.error("ERR wrong number of arguments for 'exists' command");
  return encode.integer(store.exists(...args));
}
