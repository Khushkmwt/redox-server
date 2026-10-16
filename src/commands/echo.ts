import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// ECHO message
export function echo(args: string[], _store: Store): Buffer {
  if (args.length !== 1)
    return encode.error("ERR wrong number of arguments for 'echo' command");
  return encode.bulkString(args[0]);
}
