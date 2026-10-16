import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// TYPE key
export function type(args: string[], store: Store): Buffer {
  if (args.length !== 1)
    return encode.error("ERR wrong number of arguments for 'type' command");
  return encode.simpleString(store.type(args[0]));
}
