import crypto from "node:crypto";
import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import type { ConnectionContext } from "../types/commands.js";
import { errWrongArgs } from "./command-utils.js";

/**
 * Constant-time string comparison using fixed-length SHA-256 digests.
 * Prevents side-channel timing attacks on password verification.
 */
function secureCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// AUTH [username] password
export function auth(args: string[], _store: Store, context?: ConnectionContext): Buffer {
  if (args.length !== 1 && args.length !== 2) {
    return errWrongArgs("auth");
  }

  if (!context?.serverPassword) {
    return encode.error("ERR Client sent AUTH, but no password is set");
  }

  const password = args.length === 1 ? args[0] : args[1];

  if (secureCompare(password, context.serverPassword)) {
    if (context) {
      context.authenticated = true;
    }
    return encode.simpleString("OK");
  }

  return encode.error("ERR invalid password");
}
