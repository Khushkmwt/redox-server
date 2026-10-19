import fs from "node:fs";
import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { getDefaultDumpPath } from "../storage/persistence.js";

// FLUSHALL — delete every key in the store
export function flushall(args: string[], store: Store): Buffer {
  if (args.length !== 0)
    return encode.error("ERR wrong number of arguments for 'flushall' command");
  store.flushAll();
  try {
    const dumpPath = getDefaultDumpPath();
    if (fs.existsSync(dumpPath)) {
      fs.unlinkSync(dumpPath);
    }
  } catch {
    // Ignore persistence cleanup errors
  }
  return encode.simpleString("OK");
}
