import type { Store } from "../storage/store.js";

export interface ConnectionContext {
  id?: number;
  authenticated: boolean;
  serverPassword?: string;
  remoteAddress?: string;
  remotePort?: number;
  name?: string;
}

export type CommandHandler = (
  args: string[],
  store: Store,
  context?: ConnectionContext
) => Buffer;
