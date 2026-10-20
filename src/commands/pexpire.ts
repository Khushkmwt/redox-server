import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { isIntegerString } from "../utils/validators.js";
import { errWrongArgs, errNotInteger } from "./command-utils.js";

// PEXPIRE key milliseconds
export function pexpire(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return errWrongArgs("pexpire");
  }

  if (!isIntegerString(args[1])) {
    return errNotInteger();
  }

  const ms = parseInt(args[1], 10);
  if (isNaN(ms)) {
    return errNotInteger();
  }

  const ok = store.pexpire(args[0], ms);
  return encode.integer(ok ? 1 : 0);
}
