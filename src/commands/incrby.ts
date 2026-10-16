import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { applyIntegerDelta, parseIntegerArg } from "./integer-utils.js";

// INCRBY key increment — increment number stored at key by increment
export function incrby(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return encode.error("ERR wrong number of arguments for 'incrby' command");
  }
  const delta = parseIntegerArg(args[1]);
  if (delta === null) {
    return encode.error("ERR value is not an integer or out of range");
  }
  return applyIntegerDelta(args[0], delta, store);
}
