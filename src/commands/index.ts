// Command dispatcher.
// Normalizes the command name, looks it up in the handler map,
// validates argument counts, enforces authentication, and returns a RESP2-encoded response Buffer.
// All errors are returned as RESP2 error replies — nothing is thrown.

import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import type { ConnectionContext } from "../types/commands.js";
import { commandHandlers } from "./registry.js";

export { commandHandlers, getSupportedCommands } from "./registry.js";

/**
 * Dispatch a parsed RESP2 command array to the appropriate handler.
 * @param args    Full argument list — args[0] is the command name.
 * @param store   The shared key-value store.
 * @param context Optional connection-level session context.
 * @returns       A RESP2-encoded Buffer ready to write to the socket.
 */
export function dispatch(
  args: string[],
  store: Store,
  context?: ConnectionContext
): Buffer {
  if (args.length === 0) {
    return encode.error("ERR empty command");
  }

  store.totalCommands++;
  const name = args[0].toUpperCase();

  // Authentication gatekeeper:
  // If connection is unauthenticated, reject all commands except AUTH, QUIT, and COMMAND.
  if (context && !context.authenticated) {
    if (name !== "AUTH" && name !== "QUIT" && name !== "COMMAND") {
      return encode.error("NOAUTH Authentication required.");
    }
  }

  const handler = commandHandlers[name];

  if (!handler) {
    return encode.error(
      `ERR unknown command '${args[0]}', with args beginning with: ${args.slice(1, 3).map((a) => `'${a}'`).join(", ")}`
    );
  }

  try {
    return handler(args.slice(1), store, context);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("WRONGTYPE") || msg.startsWith("OOM") || msg.startsWith("ERR")) {
      return encode.error(msg);
    }
    return encode.error(`ERR internal error: ${msg}`);
  }
}
