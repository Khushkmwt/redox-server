import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../../src/storage/store.js";
import { dispatch } from "../../src/commands/index.js";

beforeEach(() => {
  store.flushAll();
});

function run(cmd: string[]): string {
  return dispatch(cmd, store).toString();
}

describe("Hash commands", () => {
  it("HSET and HGET basic operations", () => {
    // Add two fields: returns :2
    expect(run(["HSET", "user:1", "name", "Alice", "role", "Admin"])).toBe(":2\r\n");

    // Overwrite one field: returns :0 because no new field created
    expect(run(["HSET", "user:1", "name", "Alice Smith"])).toBe(":0\r\n");

    expect(run(["HGET", "user:1", "name"])).toBe("$11\r\nAlice Smith\r\n");
    expect(run(["HGET", "user:1", "role"])).toBe("$5\r\nAdmin\r\n");
    expect(run(["HGET", "user:1", "missing"])).toBe("$-1\r\n");
  });

  it("HMGET retrieves multiple fields in order", () => {
    run(["HSET", "profile", "a", "1", "b", "2"]);
    const res = run(["HMGET", "profile", "a", "nonexistent", "b"]);
    expect(res).toBe("*3\r\n$1\r\n1\r\n$-1\r\n$1\r\n2\r\n");
  });

  it("HDEL, HEXISTS, and HLEN", () => {
    run(["HSET", "meta", "k1", "v1", "k2", "v2", "k3", "v3"]);

    expect(run(["HLEN", "meta"])).toBe(":3\r\n");
    expect(run(["HEXISTS", "meta", "k2"])).toBe(":1\r\n");
    expect(run(["HEXISTS", "meta", "k9"])).toBe(":0\r\n");

    // Delete k1 and k2
    expect(run(["HDEL", "meta", "k1", "k2", "k9"])).toBe(":2\r\n");
    expect(run(["HLEN", "meta"])).toBe(":1\r\n");

    // Deleting last field also deletes the key
    expect(run(["HDEL", "meta", "k3"])).toBe(":1\r\n");
    expect(run(["EXISTS", "meta"])).toBe(":0\r\n");
  });

  it("HGETALL, HKEYS, and HVALS", () => {
    run(["HSET", "cart", "apple", "5", "banana", "10"]);

    const all = run(["HGETALL", "cart"]);
    expect(all).toContain("apple");
    expect(all).toContain("5");
    expect(all).toContain("banana");
    expect(all).toContain("10");

    const keys = run(["HKEYS", "cart"]);
    expect(keys).toContain("apple");
    expect(keys).toContain("banana");

    const vals = run(["HVALS", "cart"]);
    expect(vals).toContain("5");
    expect(vals).toContain("10");
  });

  it("TYPE returns hash for hash keys and string for string keys", () => {
    run(["SET", "strKey", "val"]);
    run(["HSET", "hashKey", "f", "v"]);

    expect(run(["TYPE", "strKey"])).toBe("+string\r\n");
    expect(run(["TYPE", "hashKey"])).toBe("+hash\r\n");
    expect(run(["TYPE", "missingKey"])).toBe("+none\r\n");
  });

  it("enforces WRONGTYPE error when operating on wrong data type", () => {
    run(["SET", "myString", "hello"]);
    run(["HSET", "myHash", "f", "v"]);

    // Attempting hash command on string key
    expect(run(["HGET", "myString", "f"])).toContain(
      "-WRONGTYPE Operation against a key holding the wrong kind of value"
    );
    expect(run(["HSET", "myString", "f", "v"])).toContain("-WRONGTYPE");

    // Attempting string command on hash key
    expect(run(["GET", "myHash"])).toContain(
      "-WRONGTYPE Operation against a key holding the wrong kind of value"
    );
  });
});
