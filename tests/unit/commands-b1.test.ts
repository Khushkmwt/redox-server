import { describe, it, expect, beforeEach } from "vitest";
import { dispatch } from "../../src/commands/index.js";
import { store } from "../../src/storage/store.js";

beforeEach(() => {
  store.flushAll();
});

function run(cmd: string[]): string {
  return dispatch(cmd, store).toString();
}

describe("ECHO", () => {
  it("returns message as bulk string", () => {
    expect(run(["ECHO", "hello"])).toBe("$5\r\nhello\r\n");
  });
  it("error on wrong arg count", () => {
    expect(run(["ECHO"])).toMatch(/ERR/);
    expect(run(["ECHO", "a", "b"])).toMatch(/ERR/);
  });
});

describe("DBSIZE", () => {
  it("returns 0 on empty store", () => {
    expect(run(["DBSIZE"])).toBe(":0\r\n");
  });
  it("returns correct count after sets", () => {
    store.set("a", "1");
    store.set("b", "2");
    expect(run(["DBSIZE"])).toBe(":2\r\n");
  });
  it("error on wrong arg count", () => {
    expect(run(["DBSIZE", "extra"])).toMatch(/ERR/);
  });
});

describe("FLUSHALL", () => {
  it("clears all keys and returns OK", () => {
    store.set("a", "1");
    store.set("b", "2");
    expect(run(["FLUSHALL"])).toBe("+OK\r\n");
    expect(run(["DBSIZE"])).toBe(":0\r\n");
  });
  it("error on wrong arg count", () => {
    expect(run(["FLUSHALL", "extra"])).toMatch(/ERR/);
  });
});

describe("APPEND", () => {
  it("creates key if missing and returns byte length", () => {
    expect(run(["APPEND", "k", "Hello"])).toBe(":5\r\n");
    expect(store.get("k")).toBe("Hello");
  });
  it("appends to existing value", () => {
    store.set("k", "Hello");
    expect(run(["APPEND", "k", " World"])).toBe(":11\r\n");
    expect(store.get("k")).toBe("Hello World");
  });
  it("counts byte length for non-ASCII", () => {
    // "é" is 2 bytes in UTF-8
    expect(run(["APPEND", "k", "é"])).toBe(":2\r\n");
  });
  it("error on wrong arg count", () => {
    expect(run(["APPEND", "k"])).toMatch(/ERR/);
  });
});

describe("STRLEN", () => {
  it("returns 0 for missing key", () => {
    expect(run(["STRLEN", "missing"])).toBe(":0\r\n");
  });
  it("returns byte length of stored value", () => {
    store.set("k", "Hello");
    expect(run(["STRLEN", "k"])).toBe(":5\r\n");
  });
  it("counts byte length for non-ASCII", () => {
    store.set("k", "é"); // 2 bytes
    expect(run(["STRLEN", "k"])).toBe(":2\r\n");
  });
  it("error on wrong arg count", () => {
    expect(run(["STRLEN"])).toMatch(/ERR/);
  });
});
