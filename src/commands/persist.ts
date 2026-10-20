import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// PERSIST key — removes expiration from a key
export function persist(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'persist' command");
  }

  const ok = store.persist(args[0]);
  return encode.integer(ok ? 1 : 0);
}
