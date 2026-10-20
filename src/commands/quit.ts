import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// QUIT
export function quit(_args: string[], _store: Store): Buffer {
  return encode.simpleString("OK");
}
