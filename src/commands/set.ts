import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { isPositiveIntegerString } from "../utils/validators.js";
import { MAX_TTL_SECONDS, MAX_TTL_MS } from "../utils/constants.js";
import { errWrongArgs, errNotInteger, errSyntax } from "./command-utils.js";

// SET key value [EX seconds] [PX milliseconds]
export function set(args: string[], store: Store): Buffer {
  if (args.length !== 2 && args.length !== 4) {
    return errWrongArgs("set");
  }

  const [key, value] = args;
  let ttlMs: number | undefined;

  if (args.length === 4) {
    const opt = args[2].toUpperCase();
    if (!isPositiveIntegerString(args[3])) {
      return errNotInteger();
    }
    const duration = parseInt(args[3], 10);

    if (isNaN(duration) || duration <= 0) {
      return errNotInteger();
    }

    if (opt === "EX") {
      if (duration > MAX_TTL_SECONDS) {
        return errNotInteger();
      }
      ttlMs = duration * 1000;
    } else if (opt === "PX") {
      if (duration > MAX_TTL_MS) {
        return errNotInteger();
      }
      ttlMs = duration;
    } else {
      return errSyntax();
    }
  }

  try {
    store.set(key, value, ttlMs);
    return encode.simpleString("OK");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
