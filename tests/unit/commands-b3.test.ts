import { describe, it, expect, beforeEach } from "vitest";
import { dispatch } from "../../src/commands/index.js";
import { store } from "../../src/storage/store.js";
import { SUPPORTED_COMMANDS } from "../../src/commands/command.js";

beforeEach(() => {
  store.flushAll();
});

function run(cmd: string[]): string {
  return dispatch(cmd, store).toString();
}

describe("MSET", () => {
  it("sets multiple key-value pairs atomically", () => {
    expect(run(["MSET", "k1", "v1", "k2", "v2", "k3", "v3"])).toBe("+OK\r\n");
    expect(store.get("k1")).toBe("v1");
    expect(store.get("k2")).toBe("v2");
    expect(store.get("k3")).toBe("v3");
  });

  it("returns error on odd number of arguments or empty args", () => {
    expect(run(["MSET"])).toMatch(/ERR wrong number of arguments/);
    expect(run(["MSET", "k1"])).toMatch(/ERR wrong number of arguments/);
    expect(run(["MSET", "k1", "v1", "k2"])).toMatch(/ERR wrong number of arguments/);
  });
});

describe("MGET", () => {
  it("returns values for multiple keys including missing ones", () => {
    store.set("a", "alpha");
    store.set("b", "beta");

    const res = run(["MGET", "a", "missing", "b"]);
    expect(res).toBe("*3\r\n$5\r\nalpha\r\n$-1\r\n$4\r\nbeta\r\n");
  });

  it("returns error when no keys provided", () => {
    expect(run(["MGET"])).toMatch(/ERR wrong number of arguments/);
  });
});

describe("KEYS", () => {
  it("returns all keys with wildcard *", () => {
    store.set("user:1", "alice");
    store.set("user:2", "bob");
    store.set("admin:1", "root");

    const res = run(["KEYS", "*"]);
    expect(res).toContain("user:1");
    expect(res).toContain("user:2");
    expect(res).toContain("admin:1");
    expect(res.startsWith("*3\r\n")).toBe(true);
  });

  it("matches prefix pattern user:*", () => {
    store.set("user:1", "alice");
    store.set("user:2", "bob");
    store.set("admin:1", "root");

    const res = run(["KEYS", "user:*"]);
    expect(res).toContain("user:1");
    expect(res).toContain("user:2");
    expect(res).not.toContain("admin:1");
    expect(res.startsWith("*2\r\n")).toBe(true);
  });

  it("matches single character wildcard ?", () => {
    store.set("h?llo", "1");
    store.set("hello", "2");
    store.set("hallo", "3");
    store.set("hllo", "4");

    const res = run(["KEYS", "h?llo"]);
    expect(res).toContain("hello");
    expect(res).toContain("hallo");
    expect(res).not.toContain("hllo");
  });

  it("returns empty array when nothing matches", () => {
    store.set("a", "1");
    expect(run(["KEYS", "z*"])).toBe("*0\r\n");
  });

  it("returns error on wrong argument count", () => {
    expect(run(["KEYS"])).toMatch(/ERR wrong number of arguments/);
    expect(run(["KEYS", "a", "b"])).toMatch(/ERR wrong number of arguments/);
  });
});

describe("COMMAND", () => {
  it("COMMAND returns list of supported commands", () => {
    const res = run(["COMMAND"]);
    expect(res.startsWith(`*${SUPPORTED_COMMANDS.length}\r\n`)).toBe(true);
    expect(res).toContain("PING");
    expect(res).toContain("SET");
    expect(res).toContain("GET");
  });

  it("COMMAND COUNT returns number of commands", () => {
    expect(run(["COMMAND", "COUNT"])).toBe(`:${SUPPORTED_COMMANDS.length}\r\n`);
  });

  it("COMMAND DOCS returns empty array", () => {
    expect(run(["COMMAND", "DOCS"])).toBe("*0\r\n");
  });
});
