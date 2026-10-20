import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/storage/store.js";
import { dispatch } from "../../src/commands/index.js";

describe("Set Commands Suite", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store();
  });

  describe("SADD and SMEMBERS", () => {
    it("adds unique members and ignores duplicates", () => {
      // Add 3 unique members
      let res = dispatch(["SADD", "myset", "apple", "banana", "cherry"], store);
      expect(res.toString()).toBe(":3\r\n");

      // Adding existing members and 1 new member
      res = dispatch(["SADD", "myset", "apple", "date"], store);
      expect(res.toString()).toBe(":1\r\n");

      // Verify cardinality
      res = dispatch(["SCARD", "myset"], store);
      expect(res.toString()).toBe(":4\r\n");

      // Verify members
      const membersRes = dispatch(["SMEMBERS", "myset"], store).toString();
      expect(membersRes).toContain("apple");
      expect(membersRes).toContain("banana");
      expect(membersRes).toContain("cherry");
      expect(membersRes).toContain("date");
    });

    it("returns WRONGTYPE error when operating on non-set key", () => {
      dispatch(["SET", "strkey", "hello"], store);
      const res = dispatch(["SADD", "strkey", "m1"], store);
      expect(res.toString()).toBe(
        "-WRONGTYPE Operation against a key holding the wrong kind of value\r\n"
      );
    });

    it("returns empty array for SMEMBERS on non-existent key", () => {
      const res = dispatch(["SMEMBERS", "nokey"], store);
      expect(res.toString()).toBe("*0\r\n");
    });
  });

  describe("SISMEMBER", () => {
    it("checks member existence accurately", () => {
      dispatch(["SADD", "users", "alice", "bob"], store);

      let res = dispatch(["SISMEMBER", "users", "alice"], store);
      expect(res.toString()).toBe(":1\r\n");

      res = dispatch(["SISMEMBER", "users", "charlie"], store);
      expect(res.toString()).toBe(":0\r\n");

      // Non-existent key returns 0
      res = dispatch(["SISMEMBER", "nokey", "alice"], store);
      expect(res.toString()).toBe(":0\r\n");
    });
  });

  describe("SREM", () => {
    beforeEach(() => {
      dispatch(["SADD", "tags", "tech", "news", "ai", "cloud"], store);
    });

    it("removes specified members", () => {
      let res = dispatch(["SREM", "tags", "news", "unknown"], store);
      expect(res.toString()).toBe(":1\r\n");

      res = dispatch(["SCARD", "tags"], store);
      expect(res.toString()).toBe(":3\r\n");
    });

    it("automatically deletes key when set becomes empty", () => {
      dispatch(["SREM", "tags", "tech", "news", "ai", "cloud"], store);
      expect(store.exists("tags")).toBe(0);
      expect(store.type("tags")).toBe("none");
    });

    it("returns 0 when removing from non-existent key", () => {
      const res = dispatch(["SREM", "nokey", "foo"], store);
      expect(res.toString()).toBe(":0\r\n");
    });
  });
});
