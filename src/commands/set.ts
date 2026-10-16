import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// SET key value [EX seconds] [PX milliseconds]
export function set(args: string[], store: Store): Buffer {
  if (args.length !== 2 && args.length !== 4) {
    return encode.error("ERR wrong number of arguments for 'set' command");
  }

  const [key, value] = args;
  let ttlMs: number | undefined;

  if (args.length === 4) {
    const opt = args[2].toUpperCase();
    const duration = parseInt(args[3], 10);

    if (isNaN(duration) || duration <= 0) {
      return encode.error("ERR value is not an integer or out of range");
    }

    if (opt === "EX") {
      ttlMs = duration * 1000;
    } else if (opt === "PX") {
      ttlMs = duration;
    } else {
      return encode.error("ERR syntax error");
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
