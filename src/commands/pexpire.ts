import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { isIntegerString } from "../utils/validators.js";

// PEXPIRE key milliseconds
export function pexpire(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return encode.error("ERR wrong number of arguments for 'pexpire' command");
  }

  if (!isIntegerString(args[1])) {
    return encode.error("ERR value is not an integer or out of range");
  }

  const ms = parseInt(args[1], 10);
  if (isNaN(ms)) {
    return encode.error("ERR value is not an integer or out of range");
  }

  const ok = store.pexpire(args[0], ms);
  return encode.integer(ok ? 1 : 0);
}
