import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { getSupportedCommands } from "./registry.js";

/**
 * Transparent proxy providing array access to dynamically registered commands.
 * Prevents manually updating this file whenever new commands are added.
 */
export const SUPPORTED_COMMANDS: string[] = new Proxy([] as string[], {
  get(_target, prop) {
    const list = getSupportedCommands();
    if (prop === "length") return list.length;
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return list[Number(prop)];
    }
    const val = (list as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? (val as Function).bind(list) : val;
  },
});

type SubcommandHandler = () => Buffer;

const subcommandHandlers: Record<string, SubcommandHandler> = {
  COUNT: () => encode.integer(getSupportedCommands().length),
  DOCS: () => encode.array([]),
  LIST: () => encode.array(getSupportedCommands().map((name) => encode.bulkString(name))),
};

// COMMAND [DOCS | COUNT | LIST]
export function command(args: string[], _store: Store): Buffer {
  const sub = args[0]?.toUpperCase();

  if (sub && sub in subcommandHandlers) {
    return subcommandHandlers[sub]();
  }

  // Bare COMMAND returns standard Redis nested command specifications
  const matrix = getSupportedCommands().map((name) =>
    encode.array([
      encode.bulkString(name.toUpperCase()),
      encode.integer(1),
      encode.array([encode.simpleString("fast")]),
      encode.integer(1),
      encode.integer(1),
      encode.integer(1),
    ])
  );

  return encode.array(matrix);
}
