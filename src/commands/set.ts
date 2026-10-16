import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// SET key value
export function set(args: string[], store: Store): Buffer {
  if (args.length !== 2)
    return encode.error("ERR wrong number of arguments for 'set' command");
  store.set(args[0], args[1]);
  return encode.simpleString("OK");
}
