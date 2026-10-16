import { describe, it, expect, beforeEach } from "vitest";
import { dispatch } from "../../src/commands/index.js";
import { store } from "../../src/storage/store.js";

beforeEach(() => {
  store.del("name", "a", "b", "k");
});

function run(cmd: string[]): string {
  return dispatch(cmd, store).toString();
}

describe("command dispatcher", () => {
  // --- Unknown / empty ---
  it("returns error for unknown command", () => {
    expect(run(["NONEXISTENT_CMD"])).toMatch(/ERR unknown command/);
  });

  it("returns error for empty args", () => {
    expect(run([])).toMatch(/ERR empty command/);
  });

  it("is case-insensitive for command names", () => {
    expect(run(["ping"])).toBe("+PONG\r\n");
    expect(run(["Ping"])).toBe("+PONG\r\n");
  });

  // --- PING ---
  it("PING with no args returns PONG", () => {
    expect(run(["PING"])).toBe("+PONG\r\n");
  });

  it("PING with message echoes bulk string", () => {
    expect(run(["PING", "hello"])).toBe("$5\r\nhello\r\n");
  });

  it("PING with too many args returns error", () => {
    expect(run(["PING", "a", "b"])).toMatch(/ERR/);
  });

  // --- SET ---
  it("SET with correct args returns OK", () => {
    expect(run(["SET", "name", "Alice"])).toBe("+OK\r\n");
    expect(store.get("name")).toBe("Alice");
  });

  it("SET with wrong arg count returns error", () => {
    expect(run(["SET", "only-one"])).toMatch(/ERR/);
  });

  // --- GET ---
  it("GET returns value for existing key", () => {
    store.set("name", "Bob");
    expect(run(["GET", "name"])).toBe("$3\r\nBob\r\n");
  });

  it("GET returns null bulk string for missing key", () => {
    expect(run(["GET", "name"])).toBe("$-1\r\n");
  });

  it("GET with wrong arg count returns error", () => {
    expect(run(["GET"])).toMatch(/ERR/);
  });

  // --- DEL ---
  it("DEL removes key and returns :1", () => {
    store.set("a", "v");
    expect(run(["DEL", "a"])).toBe(":1\r\n");
  });

  it("DEL missing key returns :0", () => {
    expect(run(["DEL", "a"])).toBe(":0\r\n");
  });

  it("DEL multiple keys returns correct count", () => {
    store.set("a", "1");
    store.set("b", "2");
    expect(run(["DEL", "a", "b", "k"])).toBe(":2\r\n");
  });

  // --- EXISTS ---
  it("EXISTS returns count of present keys", () => {
    store.set("a", "1");
    expect(run(["EXISTS", "a", "b"])).toBe(":1\r\n");
  });

  // --- TYPE ---
  it("TYPE returns 'string' for a set key", () => {
    store.set("a", "v");
    expect(run(["TYPE", "a"])).toBe("+string\r\n");
  });

  it("TYPE returns 'none' for missing key", () => {
    expect(run(["TYPE", "a"])).toBe("+none\r\n");
  });
});
