import type { Store } from "../storage/store.js";

export type CommandHandler = (args: string[], store: Store) => Buffer;
