import net from "node:net";
import { RespParser } from "./protocol/resp-parser.js";
import { dispatch } from "./commands/index.js";
import { store } from "./storage/store.js";
import { encode } from "./protocol/resp-encoder.js";
import { logger } from "./utils/logger.js";
import type { ConnectionContext } from "./types/commands.js";
import { restoreSnapshot, saveSnapshot } from "./storage/persistence.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 6379);
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 100);
const TIMEOUT_SECONDS = Number(process.env.TIMEOUT ?? 0);
const DEFAULT_PASSWORD = process.env.REDOX_PASSWORD ?? process.env.REQUIREPASS;

function parseCliPassword(): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--requirepass" || args[i] === "-a") {
      return args[i + 1];
    }
    if (args[i].startsWith("--requirepass=")) {
      return args[i].slice("--requirepass=".length);
    }
  }
  return undefined;
}

export interface RedoxServerOptions {
  store?: typeof store;
  maxConnections?: number;
  timeoutSeconds?: number;
  password?: string;
}

let nextClientId = 1;

export function createRedoxServer(options: RedoxServerOptions = {}): net.Server {
  const storeInstance = options.store ?? store;
  const maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
  const timeoutSeconds = options.timeoutSeconds ?? TIMEOUT_SECONDS;
  const serverPassword = options.password ?? parseCliPassword() ?? DEFAULT_PASSWORD;
  let activeConnections = 0;

  return net.createServer((socket) => {
    if (activeConnections >= maxConnections) {
      logger.warn(
        `[rejected] ${socket.remoteAddress}:${socket.remotePort} — max connections (${maxConnections}) reached`
      );
      socket.write(encode.error("ERR max number of clients reached"));
      socket.destroy();
      return;
    }

    activeConnections++;
    storeInstance.totalConnections++;
    const clientId = nextClientId++;
    socket.setNoDelay(true);
    logger.info(`[connect] id=${clientId} ${socket.remoteAddress}:${socket.remotePort} (active: ${activeConnections})`);

    const context: ConnectionContext = {
      id: clientId,
      authenticated: !serverPassword,
      serverPassword: serverPassword || undefined,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
    };

    if (timeoutSeconds > 0) {
      socket.setTimeout(timeoutSeconds * 1000);
      socket.on("timeout", () => {
        logger.info(
          `[timeout] ${socket.remoteAddress}:${socket.remotePort} idle for ${timeoutSeconds}s, closing`
        );
        socket.destroy();
      });
    }

    const parser = new RespParser(
      (args) => {
        const response = dispatch(args, storeInstance, context);
        socket.write(response);
        if (args[0]?.toUpperCase() === "QUIT") {
          socket.end();
        }
      },
      (msg) => {
        logger.error(`[parse error] ${socket.remoteAddress}: ${msg}`);
        socket.write(encode.error(`ERR Protocol error: ${msg}`));
        socket.destroy();
      }
    );

    socket.on("data", (chunk) => {
      parser.feed(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    socket.on("error", (err) => {
      logger.error(`[socket error] ${socket.remoteAddress}: ${err.message}`);
    });

    socket.on("close", () => {
      activeConnections = Math.max(0, activeConnections - 1);
      logger.info(`[disconnect] ${socket.remoteAddress}:${socket.remotePort} (active: ${activeConnections})`);
    });
  });
}

export const server = createRedoxServer();

server.on("error", (err) => {
  logger.error(`[server error] ${err.message}`);
  process.exit(1);
});

// Attempt to restore snapshot on startup if available
try {
  const restored = restoreSnapshot(store);
  if (restored) {
    logger.info(
      `[persistence] Restored ${restored.restoredCount} keys from snapshot in ${restored.elapsedMs.toFixed(1)}ms`
    );
  }
} catch (err: unknown) {
  logger.warn(`[persistence] Could not load snapshot: ${err}`);
}

server.listen(PORT, HOST, () => {
  const activePass = parseCliPassword() ?? DEFAULT_PASSWORD;
  logger.info(
    `Redox listening on ${HOST}:${PORT}${activePass ? " (password protection enabled)" : ""}`
  );
});

// Graceful shutdown
function shutdown() {
  logger.info("Shutting down…");
  try {
    const saved = saveSnapshot(store);
    logger.info(`[persistence] Saved ${saved.keyCount} keys to snapshot before exit`);
  } catch (err: unknown) {
    logger.error(`[persistence] Failed to save snapshot on shutdown: ${err}`);
  }

  const forceTimeout = setTimeout(() => {
    logger.warn("Forcing exit after shutdown timeout");
    process.exit(0);
  }, 3000);
  forceTimeout.unref();

  const serverWithClose = server as net.Server & { closeAllConnections?: () => void };
  if (typeof serverWithClose.closeAllConnections === "function") {
    serverWithClose.closeAllConnections();
  }

  server.close(() => {
    clearTimeout(forceTimeout);
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
