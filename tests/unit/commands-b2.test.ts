import { describe, it, expect, beforeEach } from "vitest";
import { dispatch } from "../../src/commands/index.js";
import { store } from "../../src/storage/store.js";

beforeEach(() => {
  store.flushAll();
});

function run(cmd: string[]): string {
  return dispatch(cmd, store).toString();
}

describe("INCR and INCRBY", () => {
  it("INCR initializes non-existent key to 1", () => {
    expect(run(["INCR", "counter"])).toBe(":1\r\n");
    expect(store.get("counter")).toBe("1");
  });

  it("INCR increments existing integer value", () => {
    store.set("counter", "10");
    expect(run(["INCR", "counter"])).toBe(":11\r\n");
    expect(store.get("counter")).toBe("11");
  });

  it("INCR handles negative values", () => {
    store.set("counter", "-5");
    expect(run(["INCR", "counter"])).toBe(":-4\r\n");
  });

  it("INCR returns error if value is not an integer", () => {
    store.set("str", "hello");
    expect(run(["INCR", "str"])).toBe("-ERR value is not an integer or out of range\r\n");
  });

  it("INCR returns error on wrong argument count", () => {
    expect(run(["INCR"])).toMatch(/ERR wrong number of arguments/);
    expect(run(["INCR", "a", "b"])).toMatch(/ERR wrong number of arguments/);
  });

  it("INCRBY adds specified increment", () => {
    expect(run(["INCRBY", "counter", "5"])).toBe(":5\r\n");
    expect(run(["INCRBY", "counter", "10"])).toBe(":15\r\n");
    expect(run(["INCRBY", "counter", "-3"])).toBe(":12\r\n");
  });

  it("INCRBY returns error if increment is not integer", () => {
    expect(run(["INCRBY", "counter", "abc"])).toBe("-ERR value is not an integer or out of range\r\n");
  });

  it("INCRBY returns error on wrong argument count", () => {
    expect(run(["INCRBY", "counter"])).toMatch(/ERR wrong number of arguments/);
  });
});

describe("DECR and DECRBY", () => {
  it("DECR initializes non-existent key to -1", () => {
    expect(run(["DECR", "counter"])).toBe(":-1\r\n");
    expect(store.get("counter")).toBe("-1");
  });

  it("DECR decrements existing integer value", () => {
    store.set("counter", "10");
    expect(run(["DECR", "counter"])).toBe(":9\r\n");
  });

  it("DECR returns error if value is not an integer", () => {
    store.set("counter", "not-a-number");
    expect(run(["DECR", "counter"])).toBe("-ERR value is not an integer or out of range\r\n");
  });

  it("DECR returns error on wrong argument count", () => {
    expect(run(["DECR"])).toMatch(/ERR wrong number of arguments/);
  });

  it("DECRBY subtracts specified decrement", () => {
    store.set("counter", "20");
    expect(run(["DECRBY", "counter", "5"])).toBe(":15\r\n");
    expect(run(["DECRBY", "counter", "-10"])).toBe(":25\r\n");
  });

  it("DECRBY returns error if decrement is not integer", () => {
    expect(run(["DECRBY", "counter", "notanint"])).toBe("-ERR value is not an integer or out of range\r\n");
  });

  it("DECRBY returns error on wrong argument count", () => {
    expect(run(["DECRBY", "counter"])).toMatch(/ERR wrong number of arguments/);
  });
});
