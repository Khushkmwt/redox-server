import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/storage/store.js";
import { dispatch } from "../../src/commands/index.js";
import type { ConnectionContext } from "../../src/types/commands.js";

describe("Authentication & requirepass Suite", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store();
  });

  describe("when no password is configured (open mode)", () => {
    it("allows commands to execute without AUTH", () => {
      const resPing = dispatch(["PING"], store);
      expect(resPing.toString()).toBe("+PONG\r\n");

      const resSet = dispatch(["SET", "key", "val"], store);
      expect(resSet.toString()).toBe("+OK\r\n");

      const resGet = dispatch(["GET", "key"], store);
      expect(resGet.toString()).toBe("$3\r\nval\r\n");
    });

    it("returns error if client sends AUTH when no password is set", () => {
      const context: ConnectionContext = {
        authenticated: true,
        serverPassword: undefined,
      };

      const res = dispatch(["AUTH", "secret"], store, context);
      expect(res.toString()).toBe("-ERR Client sent AUTH, but no password is set\r\n");
    });
  });

  describe("when password is configured (protected mode)", () => {
    const SERVER_PASS = "super-secret-123";

    it("blocks operational commands with NOAUTH when unauthenticated", () => {
      const context: ConnectionContext = {
        authenticated: false,
        serverPassword: SERVER_PASS,
      };

      const commandsToTest = [
        ["PING"],
        ["SET", "foo", "bar"],
        ["GET", "foo"],
        ["DEL", "foo"],
        ["HSET", "h", "f", "v"],
        ["LPUSH", "l", "1"],
        ["SADD", "s", "a"],
        ["DBSIZE"],
        ["FLUSHALL"],
      ];

      for (const cmd of commandsToTest) {
        const res = dispatch(cmd, store, context);
        expect(res.toString()).toBe("-NOAUTH Authentication required.\r\n");
      }
    });

    it("permits QUIT and COMMAND even when unauthenticated", () => {
      const context: ConnectionContext = {
        authenticated: false,
        serverPassword: SERVER_PASS,
      };

      const resQuit = dispatch(["QUIT"], store, context);
      expect(resQuit.toString()).toBe("+OK\r\n");

      const resCmd = dispatch(["COMMAND", "COUNT"], store, context);
      expect(resCmd.toString()).toMatch(/^:\d+\r\n/);
    });

    it("validates argument count for AUTH", () => {
      const context: ConnectionContext = {
        authenticated: false,
        serverPassword: SERVER_PASS,
      };

      const noArgs = dispatch(["AUTH"], store, context);
      expect(noArgs.toString()).toContain("-ERR wrong number of arguments for 'auth' command");

      const tooMany = dispatch(["AUTH", "user", "pass", "extra"], store, context);
      expect(tooMany.toString()).toContain("-ERR wrong number of arguments for 'auth' command");
    });

    it("rejects invalid password and keeps session unauthenticated", () => {
      const context: ConnectionContext = {
        authenticated: false,
        serverPassword: SERVER_PASS,
      };

      const res = dispatch(["AUTH", "wrong-password"], store, context);
      expect(res.toString()).toBe("-ERR invalid password\r\n");
      expect(context.authenticated).toBe(false);

      // Verify still blocked
      const resGet = dispatch(["GET", "foo"], store, context);
      expect(resGet.toString()).toBe("-NOAUTH Authentication required.\r\n");
    });

    it("authenticates successfully with single-argument syntax", () => {
      const context: ConnectionContext = {
        authenticated: false,
        serverPassword: SERVER_PASS,
      };

      const resAuth = dispatch(["AUTH", SERVER_PASS], store, context);
      expect(resAuth.toString()).toBe("+OK\r\n");
      expect(context.authenticated).toBe(true);

      // Now all commands succeed
      const resSet = dispatch(["SET", "auth_key", "auth_val"], store, context);
      expect(resSet.toString()).toBe("+OK\r\n");

      const resGet = dispatch(["GET", "auth_key"], store, context);
      expect(resGet.toString()).toBe("$8\r\nauth_val\r\n");
    });

    it("authenticates successfully with dual-argument syntax (AUTH username password)", () => {
      const context: ConnectionContext = {
        authenticated: false,
        serverPassword: SERVER_PASS,
      };

      const resAuth = dispatch(["AUTH", "default", SERVER_PASS], store, context);
      expect(resAuth.toString()).toBe("+OK\r\n");
      expect(context.authenticated).toBe(true);
    });
  });
});
