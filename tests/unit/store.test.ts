import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../../src/storage/store.js";

// Reset store state between tests by re-importing won't work across tests,
// so we delete every key we set manually.
beforeEach(() => {
  store.flushAll();
});

describe("store", () => {
  it("set and get a value", () => {
    store.set("name", "Alice");
    expect(store.get("name")).toBe("Alice");
  });

  it("returns undefined for missing key", () => {
    expect(store.get("x")).toBeUndefined();
  });

  it("overwrites an existing key", () => {
    store.set("a", "1");
    store.set("a", "2");
    expect(store.get("a")).toBe("2");
  });

  it("del removes an existing key and returns 1", () => {
    store.set("a", "v");
    expect(store.del("a")).toBe(1);
    expect(store.get("a")).toBeUndefined();
  });

  it("del returns 0 for a missing key", () => {
    expect(store.del("z")).toBe(0);
  });

  it("del handles multiple keys", () => {
    store.set("a", "1");
    store.set("b", "2");
    expect(store.del("a", "b", "c")).toBe(2); // c doesn't exist
  });

  it("exists counts present keys", () => {
    store.set("a", "1");
    store.set("b", "2");
    expect(store.exists("a", "b", "c")).toBe(2);
  });

  it("exists returns 0 when no keys present", () => {
    expect(store.exists("x", "y")).toBe(0);
  });

  it("type returns 'string' for a set key", () => {
    store.set("a", "v");
    expect(store.type("a")).toBe("string");
  });

  it("type returns 'none' for a missing key", () => {
    expect(store.type("z")).toBe("none");
  });
});
