import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// LASTSAVE — returns UNIX timestamp (in seconds) of the last successful snapshot save
export function lastsave(args: string[], store: Store): Buffer {
  if (args.length !== 0) {
    return encode.error("ERR wrong number of arguments for 'lastsave' command");
  }
  return encode.integer(store.lastSaveTimestamp);
}
