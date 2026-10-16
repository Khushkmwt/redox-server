import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// DEL key [key ...]
export function del(args: string[], store: Store): Buffer {
  if (args.length === 0)
    return encode.error("ERR wrong number of arguments for 'del' command");
  return encode.integer(store.del(...args));
}
