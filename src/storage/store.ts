// In-memory key-value store — single shared instance across all connections.
// Values are always strings in the MVP.

type ValueType = "string";

interface Entry {
  value: string;
  type: ValueType;
}

class Store {
  private readonly data = new Map<string, Entry>();

  set(key: string, value: string): void {
    this.data.set(key, { value, type: "string" });
  }

  get(key: string): string | undefined {
    return this.data.get(key)?.value;
  }

  /** Delete one or more keys. Returns the count of keys actually removed. */
  del(...keys: string[]): number {
    let removed = 0;
    for (const key of keys) {
      if (this.data.delete(key)) removed++;
    }
    return removed;
  }

  /** Count how many of the supplied keys currently exist. */
  exists(...keys: string[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.data.has(key)) count++;
    }
    return count;
  }

  /** Return the RESP2 type string for a key. */
  type(key: string): "string" | "none" {
    return this.data.has(key) ? "string" : "none";
  }

  /** Return all keys matching a glob pattern (defaulting to all keys '*'). */
  keys(pattern = "*"): string[] {
    if (pattern === "*") {
      return Array.from(this.data.keys());
    }
    const regex = globToRegExp(pattern);
    const result: string[] = [];
    for (const key of this.data.keys()) {
      if (regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }

  /** Total number of keys currently stored. */
  size(): number {
    return this.data.size;
  }

  /** Remove all keys from the store. */
  flushAll(): void {
    this.data.clear();
  }
}

/** Convert a Redis glob pattern to a JavaScript RegExp. */
export function globToRegExp(pattern: string): RegExp {
  let regexStr = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      regexStr += ".*";
    } else if (c === "?") {
      regexStr += ".";
    } else if (c === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close !== -1) {
        const inner = pattern.slice(i + 1, close);
        regexStr += `[${inner.replace(/\\/g, "\\\\")}]`;
        i = close;
      } else {
        regexStr += "\\[";
      }
    } else if ("\\.+*?^$()[]{}|".includes(c)) {
      regexStr += `\\${c}`;
    } else {
      regexStr += c;
    }
  }
  regexStr += "$";
  return new RegExp(regexStr);
}

// Singleton — imported by the server and command handlers.
export const store = new Store();
export type { Store };
