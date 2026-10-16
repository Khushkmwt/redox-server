import net from "node:net";
import { RespParser } from "./protocol/resp-parser.js";
import { dispatch } from "./commands/index.js";
import { store } from "./storage/store.js";
import { encode } from "./protocol/resp-encoder.js";
import { logger } from "./utils/logger.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 6379);
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 100);
const TIMEOUT_SECONDS = Number(process.env.TIMEOUT ?? 0);

let activeConnections = 0;

const server = net.createServer((socket) => {
  if (activeConnections >= MAX_CONNECTIONS) {
    logger.warn(
      `[rejected] ${socket.remoteAddress}:${socket.remotePort} — max connections (${MAX_CONNECTIONS}) reached`
    );
    socket.write(encode.error("ERR max number of clients reached"));
    socket.destroy();
    return;
  }

  activeConnections++;
  logger.info(`[connect] ${socket.remoteAddress}:${socket.remotePort} (active: ${activeConnections})`);

  if (TIMEOUT_SECONDS > 0) {
    socket.setTimeout(TIMEOUT_SECONDS * 1000);
    socket.on("timeout", () => {
      logger.info(
        `[timeout] ${socket.remoteAddress}:${socket.remotePort} idle for ${TIMEOUT_SECONDS}s, closing`
      );
      socket.destroy();
    });
  }

  const parser = new RespParser(
    // onCommand — a full RESP2 command array has been parsed
    (args) => {
      const response = dispatch(args, store);
      socket.write(response);
    },
    // onError — unrecoverable framing error; send RESP2 error and close
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

server.on("error", (err) => {
  logger.error(`[server error] ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  logger.info(`Redox listening on ${HOST}:${PORT}`);
});

// Graceful shutdown
function shutdown() {
  logger.info("Shutting down…");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

