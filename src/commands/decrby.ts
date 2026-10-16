import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { applyIntegerDelta, parseIntegerArg } from "./integer-utils.js";

// DECRBY key decrement — decrement number stored at key by decrement
export function decrby(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return encode.error("ERR wrong number of arguments for 'decrby' command");
  }
  const delta = parseIntegerArg(args[1]);
  if (delta === null) {
    return encode.error("ERR value is not an integer or out of range");
  }
  return applyIntegerDelta(args[0], -delta, store);
}
