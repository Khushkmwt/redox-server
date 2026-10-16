import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { saveSnapshot } from "../storage/persistence.js";

// SAVE — synchronously save dataset to disk
export function save(args: string[], store: Store): Buffer {
  if (args.length !== 0) {
    return encode.error("ERR wrong number of arguments for 'save' command");
  }

  try {
    saveSnapshot(store);
    return encode.simpleString("OK");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(`ERR persistence failure: ${msg}`);
  }
}
